"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const novel_1 = require("./novel");
const db_1 = require("../db");
const config_1 = require("../config");
const uuid_1 = require("uuid");
const upload_1 = require("../api/upload");
const stable_diffusion_1 = require("./stable-diffusion");
const ws_1 = require("../api/ws");
const horde_1 = require("./horde");
const zimage_1 = require("./zimage");
const queue_1 = require("../queue");
const subscriptions_1 = require("../db/subscriptions");
/**
 * Merge negative-prompt sources into a single comma-separated string, deduping
 * tokens case-insensitively (first occurrence wins, preserving order). Used to
 * apply the server-wide negative (config.inference.imageNegative) ahead of any
 * legacy per-character/chat/user negative.
 */
function mergeNegative(...parts) {
    const seen = new Set();
    const out = [];
    for (const part of parts) {
        if (!part)
            continue;
        for (const token of part.split(',')) {
            const trimmed = token.trim();
            if (!trimmed)
                continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(trimmed);
        }
    }
    return out.join(', ');
}
async function generateImage({ user, chatId, messageId, ...opts }, log, guestId) {
    const broadcastIds = [];
    const chat = chatId ? await db_1.store.chats.getChatOnly(chatId) : undefined;
    const characterId = chat?.imageSource === 'main-character'
        ? chat.characterId
        : chat?.imageSource === 'last-character'
            ? opts.characterId
            : // Fall back to the explicit character (e.g. the native image tool) or the
                // chat's main character so the character's stored LoRA is always used.
                // imageSettings source selection below is unchanged.
                opts.characterId || chat?.characterId;
    const character = chat && characterId ? await db_1.store.characters.getCharacter(chat.userId, characterId) : undefined;
    if (!guestId) {
        broadcastIds.push(user._id);
        if (chatId) {
            const members = await db_1.store.chats.getActiveMembers(chatId);
            broadcastIds.push(...members, user._id);
        }
    }
    let image;
    let output = '';
    let error;
    let parsed = opts.prompt.replace(/\{\{prompt\}\}/g, ' ');
    let prompt = parsed;
    let imageSettings = chat?.imageSource === 'main-character' || chat?.imageSource === 'last-character'
        ? character?.imageSettings
        : chat?.imageSource === 'chat'
            ? chat?.imageSettings
            : user.images;
    if (!imageSettings) {
        imageSettings = user.images;
    }
    if (imageSettings?.template) {
        prompt = imageSettings.template.replace(/\{\{prompt\}\}/g, parsed);
        if (!prompt.includes(parsed)) {
            prompt = prompt + ' ' + parsed;
        }
    }
    prompt = prompt.trim();
    if (!opts.noAffix) {
        const parts = [prompt];
        if (imageSettings?.prefix) {
            parts.unshift(imageSettings.prefix);
        }
        if (imageSettings?.suffix) {
            parts.push(imageSettings.suffix);
        }
        prompt = parts
            .join(', ')
            .split(',')
            .filter((p) => !!p.trim())
            .join(', ')
            .replace(/,+/g, ',')
            .replace(/ +/g, ' ');
    }
    log.debug({ prompt, type: imageSettings?.type, source: chat?.imageSource }, 'Image prompt');
    // Server-wide negative overrules: it's always applied first, with any legacy
    // stored negative appended (deduped) so nothing previously configured is lost.
    const negative = mergeNegative(config_1.config.inference.imageNegative, imageSettings?.negative);
    if (!guestId) {
        // Broadcast to all chat members (not just sendOne) so the reply message can
        // show a loading spinner while the image generates. Include `messageId` when
        // attaching to an existing message (e.g. the native image tool path).
        (0, ws_1.sendMany)(broadcastIds, {
            type: 'image-generation-started',
            prompt,
            negative,
            service: imageSettings?.type,
            requestId: opts.requestId,
            chatId,
            messageId,
        });
    }
    try {
        const priority = (0, queue_1.priorityForUser)(user, !!guestId, (0, subscriptions_1.getCachedTiers)());
        image = await queue_1.inferenceGate.run({
            kind: 'image',
            priority,
            userId: guestId ? undefined : user._id,
            socketId: guestId,
            requestId: opts.requestId,
        }, async () => {
            if ((0, zimage_1.isZImageConfigured)()) {
                const isCharImage = opts.source === 'avatar';
                const size = isCharImage
                    ? config_1.config.inference.imageSize || 640
                    : config_1.config.inference.imageChatSize || 512;
                const steps = isCharImage
                    ? config_1.config.inference.imageSteps || 14
                    : config_1.config.inference.imageChatSteps || 20;
                return (0, zimage_1.handleZImage)({
                    user,
                    prompt,
                    negative,
                    settings: imageSettings,
                    loraName: character?.loraName,
                    seed: opts.seed,
                    width: size,
                    height: size,
                    steps,
                }, log, guestId);
            }
            switch (imageSettings?.type || 'horde') {
                case 'novel':
                    return (0, novel_1.handleNovelImage)({ user, prompt, negative, settings: imageSettings }, log, guestId);
                case 'sd':
                case 'agnai':
                    return (0, stable_diffusion_1.handleSDImage)({ user, prompt, negative, settings: imageSettings }, log, guestId);
                case 'horde':
                default:
                    return (0, horde_1.handleHordeImage)({ user, prompt, negative, settings: imageSettings }, log, guestId);
            }
        });
    }
    catch (ex) {
        error = ex.message || ex;
    }
    /**
     * If the server is configured to save images: we will store the image, generate a message, then publish the message
     * Otherwise: We will broadcast the image content
     */
    if (image) {
        // Guest images do not get saved under any circumstances
        if (typeof image.content === 'string' && image.content.startsWith('http')) {
            output = image.content;
        }
        if (guestId) {
            if (!output) {
                output = `data:image/png;base64,${image.content.toString('base64')}`;
            }
            // Persist whenever this is a real chat image (has a chatId) OR the server
            // opts into saving all images. Without this, chat images were uploaded but
            // never attached to a message, so they vanished from history on refresh.
        }
        else if (!opts.ephemeral && (config_1.config.storage.saveImages || !!chatId)) {
            const name = `${(0, uuid_1.v4)()}.${image.ext}`;
            if (!output) {
                output = await (0, upload_1.saveFile)(name, image.content);
            }
            if (!guestId && chatId) {
                const msg = await createImageMessage({
                    chatId,
                    userId: user._id,
                    filename: output,
                    memberIds: broadcastIds,
                    messageId,
                    imagePrompt: opts.prompt,
                    append: opts.append,
                    meta: { negative },
                    parentId: opts.parentId,
                });
                if (msg)
                    return;
            }
        }
        else {
            // Ephemeral preview — e.g. the create-wizard portrait (or an avatar
            // regen) before the character is saved. Never persist these: previously
            // they were written as `temp-*` files with a 300s TTL, but on S3/R2 that
            // TTL is only the HTTP `Expires` cache header, NOT an object-expiration
            // rule, so abandoned previews orphaned in the bucket forever. Return the
            // image inline as base64 instead — nothing touches storage. The real
            // avatar is persisted separately when the character is actually saved.
            output = output || `data:image/${image.ext};base64,${image.content.toString('base64')}`;
        }
    }
    const message = image
        ? {
            type: 'image-generated',
            chatId,
            image: output,
            source: opts.source,
            requestId: opts.requestId,
        }
        : {
            type: 'image-failed',
            chatId,
            error: error || 'Invalid image settings (No handler found)',
            requestId: opts.requestId,
        };
    if (broadcastIds.length) {
        (0, ws_1.sendMany)(broadcastIds, message);
    }
    else if (guestId) {
        (0, ws_1.sendGuest)(guestId, message);
    }
    return { output };
}
async function createImageMessage(opts) {
    const chat = opts.chatId ? await db_1.store.chats.getChatOnly(opts.chatId) : undefined;
    if (!chat)
        return;
    const char = await db_1.store.characters.getCharacter(chat.userId, chat.characterId);
    if (!char)
        return;
    if (opts.messageId && !opts.append) {
        const msg = await db_1.store.msgs.editMessage(opts.messageId, {
            msg: opts.filename,
            adapter: 'image',
            meta: opts.meta,
        });
        (0, ws_1.sendMany)(opts.memberIds, {
            type: 'message-retry',
            chatId: opts.chatId,
            messageId: opts.messageId,
            message: opts.filename,
            adapter: 'image',
        });
        return msg;
    }
    else if (opts.messageId && opts.append) {
        const prev = await db_1.store.msgs.getMessage(opts.messageId);
        const extras = prev?.extras || [];
        extras.push(opts.filename);
        // Preserve the target message's existing adapter so its text still renders.
        // Only update `extras` — setting adapter:'image' here would make the renderer
        // treat the message text as an image URL.
        await db_1.store.msgs.editMessage(opts.messageId, { extras });
        (0, ws_1.sendMany)(opts.memberIds, {
            type: 'message-retry',
            chatId: opts.chatId,
            messageId: opts.messageId,
            message: prev?.msg || '',
            extras,
            adapter: prev?.adapter,
        });
        if (prev)
            prev.extras = extras;
        return prev;
    }
    else {
        const msg = await db_1.store.msgs.createChatMessage({
            chatId: opts.chatId,
            message: opts.filename,
            characterId: char._id,
            adapter: 'image',
            ooc: false,
            imagePrompt: opts.imagePrompt,
            event: undefined,
            meta: opts.meta,
            parent: opts.parentId,
            name: char.name,
        });
        (0, ws_1.sendMany)(opts.memberIds, { type: 'message-created', msg, chatId: opts.chatId });
        return msg;
    }
}
//# sourceMappingURL=index.js.map