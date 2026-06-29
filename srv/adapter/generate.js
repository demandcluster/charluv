"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferenceAsync = inferenceAsync;
exports.guidanceAsync = guidanceAsync;
exports.createInferenceStream = createInferenceStream;
exports.createChatStream = createChatStream;
exports.getResponseEntities = getResponseEntities;
const presets_1 = require("/common/presets");
const db_1 = require("../db");
const middleware_1 = require("../middleware");
const wrap_1 = require("../api/wrap");
const prompt_1 = require("../../common/prompt");
const horde_gen_1 = require("../../common/horde-gen");
const needle_1 = __importDefault(require("needle"));
const horde_1 = require("../api/horde");
const tokenize_1 = require("../tokenize");
const settings_1 = require("../api/settings");
const charluv_1 = require("./charluv");
const util_1 = require("/common/util");
const templates_1 = require("/common/presets/templates");
const guidance_parser_1 = require("/common/guidance/guidance-parser");
const subscriptions_1 = require("../db/subscriptions");
const queue_1 = require("../queue");
const ws_1 = require("../api/ws");
const store_1 = require("../memory/store");
let version = '';
(0, horde_gen_1.configure)(async (opts) => {
    if (!version) {
        const appConfig = await (0, settings_1.getAppConfig)();
        version = appConfig.version;
    }
    const res = await (0, needle_1.default)(opts.method, opts.url, opts.payload, {
        json: true,
        headers: {
            'Content-Type': 'application/json',
            apikey: opts.key || horde_1.HORDE_GUEST_KEY,
            'Client-Agent': `Charluv:${version}:`,
        },
    });
    return { body: res.body, statusCode: res.statusCode, statusMessage: res.statusMessage };
}, middleware_1.logger);
async function inferenceAsync(opts) {
    const retries = opts.retries ?? 0;
    let error;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const { stream, service } = await createInferenceStream(opts);
        let generated = '';
        let meta = {};
        let prompt = '';
        for await (const gen of stream) {
            if (typeof gen === 'string') {
                generated = gen;
                continue;
            }
            if ('partial' in gen && gen.partial) {
                const partial = (0, util_1.tryParse)(gen.partial);
                if (!partial || typeof partial !== 'object')
                    continue;
                (0, ws_1.sendOne)(opts.user._id, {
                    type: 'guidance-partial',
                    partial,
                    adapter: service,
                    requestId: opts.requestId,
                });
                continue;
            }
            if ('meta' in gen) {
                Object.assign(meta, gen.meta);
                continue;
            }
            if ('prompt' in gen) {
                prompt = gen.prompt;
                continue;
            }
            if ('error' in gen) {
                error = gen.error;
                if (attempt >= retries) {
                    throw new Error(gen.error);
                }
            }
        }
        if (opts.guidance &&
            (opts.settings?.service === 'horde' || opts.settings?.service === 'charluv')) {
            try {
                const values = JSON.parse(generated);
                return { generated, prompt, meta, values: Object.assign({}, opts.previous, values) };
            }
            catch (ex) { }
        }
        return { generated, prompt, meta };
    }
    if (error)
        throw error;
    throw new Error(`Could not complete inference: Max retries exceeded`);
}
async function guidanceAsync(opts) {
    const settings = await getRequestPreset(opts);
    const sub = await (0, charluv_1.getSubscriptionPreset)(opts.user, !!opts.guest, opts.settings || settings);
    const previous = { ...opts.previous };
    for (const name of opts.reguidance || []) {
        delete previous[name];
    }
    const infer = async (params, v2) => {
        const inference = await inferenceAsync({
            ...opts,
            previous,
            prompt: params.prompt,
            settings,
            maxTokens: params.tokens,
            stop: params.stop,
            guidance: v2,
        });
        return inference;
    };
    if (sub?.preset?.guidanceCapable && (sub.tier?.guidanceAccess || opts.user.admin)) {
        const srv = await db_1.store.admin.getServerConfiguration();
        const counts = (0, guidance_parser_1.calculateGuidanceCounts)(opts.prompt, opts.placeholders);
        if (srv.maxGuidanceTokens && counts.tokens > srv.maxGuidanceTokens) {
            throw new Error(`Cannot run guidance: Template is requesting too many tokens (>1000)`);
        }
        if (srv.maxGuidanceVariables && counts.vars > srv.maxGuidanceVariables) {
            throw new Error(`Cannot run guidance: Template requests too many variables (>15)`);
        }
        const result = await infer({ prompt: opts.prompt, tokens: 200, stop: opts.stop }, true);
        if (!result.values) {
            try {
                const values = JSON.parse(result.generated);
                result.values = values;
            }
            catch (ex) {
                opts.log.error({ result }, 'Failed to JSON parse guidance result');
                throw ex;
            }
        }
        return result;
    }
    const result = await (0, guidance_parser_1.runGuidance)(opts.prompt, {
        infer: (params) => infer(params, false).then((res) => res.generated),
        reguidance: opts.reguidance,
        placeholders: opts.placeholders,
        previous,
    });
    return result;
}
async function createInferenceStream(opts) {
    // getRequestPreset can return a SHARED cached preset object, so clone before
    // applying any per-request override — otherwise stop/temp/maxTokens leak into
    // the cache and affect every other request. (This also makes opts.temp /
    // opts.maxTokens actually take effect: they were declared but never applied, so
    // callers like the event director ran at the default temp instead of the 0.2
    // election / 0.7 world-beat temps they asked for.)
    const settings = { ...(await getRequestPreset(opts)) };
    if (opts.stop) {
        settings.stopSequences = opts.stop;
    }
    if (opts.temp !== undefined) {
        settings.temp = opts.temp;
    }
    if (opts.maxTokens !== undefined) {
        settings.maxTokens = opts.maxTokens;
    }
    const handler = (0, charluv_1.getHandlers)(settings);
    const stream = handler({
        kind: 'plain',
        requestId: '',
        char: {},
        chat: {},
        gen: settings,
        log: opts.log,
        lines: [],
        members: [],
        guest: opts.guest,
        user: opts.user,
        replyAs: {},
        parts: { persona: '', post: [], allPersonas: [], chatEmbeds: [], userEmbeds: [] },
        prompt: opts.prompt,
        sender: {},
        mappedSettings: (0, presets_1.mapPresetsToAdapter)(settings, settings.service),
        impersonate: undefined,
        guidance: opts.guidance,
        previous: opts.previous,
        placeholders: opts.placeholders,
        lists: opts.lists,
        jsonSchema: opts.jsonSchema,
        imageData: opts.imageData,
        images: opts.images,
        system: opts.system,
        jsonValues: opts.jsonValues,
    });
    const gated = queue_1.inferenceGate.gateStream({
        kind: 'text',
        priority: (opts.queuePriority ?? 3),
        userId: opts.guest ? undefined : opts.user?._id,
        socketId: opts.guest,
        requestId: opts.requestId,
    }, () => stream);
    return { stream: gated, service: settings.service || '' };
}
async function getRequestPreset(opts) {
    let preset;
    if (opts.settings) {
        const model = (0, subscriptions_1.getCachedSubscriptionModels)().find((m) => m._id === opts.settings?._id);
        preset = model || opts.settings;
    }
    else {
        // Custom user presets are retired — inference always runs on the platform's
        // default subscription model (the self-hosted endpoint), never a user's
        // saved preset.
        preset = (0, subscriptions_1.getCachedSubscriptionModels)().find((m) => m.isDefaultSub);
    }
    if (!preset) {
        throw new wrap_1.StatusError('Could not locate preset for inference request', 400);
    }
    if (preset.thirdPartyUrl) {
        opts.user.koboldUrl = preset.thirdPartyUrl;
    }
    if (preset.thirdPartyFormat) {
        opts.user.thirdPartyFormat = preset.thirdPartyFormat;
    }
    return preset;
}
async function createChatStream(opts, log, guestSocketId) {
    const entities = opts.entities;
    if (entities) {
        opts.settings = entities.gen;
        opts.user = entities.user;
        opts.char = entities.char;
        entities.gen.temporary = opts.settings?.temporary;
    }
    const subscription = await (0, charluv_1.getSubscriptionPreset)(opts.user, !!guestSocketId, opts.settings);
    /**
     * Only use a JSON schema if:
     * - Service allows it
     * - User preset has it enabled
     * - User preset has specified a schema
     * - There is both a history and response template
     */
    let jsonSchema;
    if (subscription?.preset && opts.entities?.gen.jsonEnabled && opts.chatSchema) {
        jsonSchema = opts.chatSchema.schema;
    }
    const fallbackContext = subscription?.preset?.maxContextLength;
    const modelContext = subscription
        ? (0, util_1.getSubscriptionModelLimits)(subscription?.preset, subscription.level)?.maxContextLength
        : undefined;
    const subContextLimit = modelContext || fallbackContext;
    opts.settings = opts.settings || {};
    if (subContextLimit) {
        opts.settings.maxContextLength = Math.min(subContextLimit, opts.settings.maxContextLength ?? 4096);
    }
    /**
     * N.b.: The front-end sends the `lines` and `history` in TIME-ASCENDING order. I.e. Oldest -> Newest
     *
     * We need to ensure the prompt is always generated using the correct version of the memory book.
     * If a non-owner initiates generation, they will not have the memory book.
     *
     * Everything else should be up to date at this point
     */
    if (entities) {
        const { adapter, model } = (0, prompt_1.getAdapter)(opts.chat, entities.user, entities.gen);
        const encoder = (0, tokenize_1.getTokenCounter)(adapter, model);
        opts.parts = await (0, prompt_1.buildPromptParts)({
            ...entities,
            sender: opts.sender,
            kind: opts.kind,
            settings: entities.gen,
            chat: opts.chat,
            members: opts.members,
            replyAs: opts.replyAs,
            impersonate: opts.impersonate,
            characters: opts.characters,
            chatEmbeds: opts.chatEmbeds || [],
            userEmbeds: opts.userEmbeds || [],
            resolvedScenario: entities.resolvedScenario,
        }, [...opts.lines].reverse(), encoder);
        // RAG: recall long-term memories relevant to the recent conversation and
        // inject them into the {{memory}} slot (additive to any book memory). Scoped
        // to the chat owner + the SPEAKING character (replyAs) so each companion only
        // recalls its own memories — in a multi-char/event chat the main char
        // (chat.characterId) is not necessarily the one replying.
        try {
            const charId = opts.replyAs?._id || opts.chat?.characterId;
            const ownerId = opts.chat?.userId;
            if (charId && ownerId && opts.lines?.length) {
                const query = [...opts.lines].slice(-3).join('\n');
                const memories = opts.chat?.memoryDisabled
                    ? []
                    : await (0, store_1.recallMemories)(ownerId, charId, query, { k: 5 });
                if (memories.length) {
                    const block = ['What you remember:'].concat(memories.map((m) => `- ${m.text}`)).join('\n');
                    opts.parts.memory = opts.parts.memory ? `${opts.parts.memory}\n${block}` : block;
                }
            }
        }
        catch (err) {
            log.warn({ err }, 'Long-term memory recall failed');
        }
    }
    if (opts.settings?.thirdPartyUrl) {
        opts.user.koboldUrl = opts.settings.thirdPartyUrl;
    }
    if (opts.settings?.thirdPartyFormat) {
        opts.user.thirdPartyFormat = opts.settings.thirdPartyFormat;
    }
    if (opts.settings?.stopSequences) {
        opts.settings.stopSequences = (0, util_1.parseStops)(opts.settings.stopSequences);
    }
    if (opts.settings?.phraseBias) {
        opts.settings.phraseBias = opts.settings.phraseBias
            .map(({ seq, bias }) => ({ seq: seq.replace(/\\n/g, '\n'), bias }))
            .filter((pb) => !!pb.seq);
    }
    const { adapter, isThirdParty, model } = (0, prompt_1.getAdapter)(opts.chat, opts.user, opts.settings);
    const encoder = (0, tokenize_1.getTokenCounter)(adapter, model, subscription?.preset);
    const handler = charluv_1.handlers[adapter];
    /**
     * Context limits set by the subscription need to be present before the prompt is finalised.
     * We never need to use the users context length here as the subscription should contain the maximum possible context length.
     */
    const prompt = await (0, prompt_1.assemblePrompt)(opts, opts.parts, opts.lines, encoder);
    const size = encoder([
        opts.parts.sampleChat,
        opts.parts.scenario,
        opts.parts.memory,
        opts.parts.systemPrompt,
        opts.parts.ujb,
        opts.parts.persona,
    ]
        .filter((l) => !!l)
        .join('\n'));
    if (opts.impersonate) {
        Object.assign(opts.characters, { impersonated: opts.impersonate });
    }
    const gen = opts.settings || (0, presets_1.getFallbackPreset)(adapter);
    const mappedSettings = (0, presets_1.mapPresetsToAdapter)(gen, adapter);
    const stream = handler({
        requestId: opts.requestId,
        kind: opts.kind,
        char: opts.char,
        chat: opts.chat,
        gen: opts.settings || {},
        log,
        members: opts.members.concat(opts.sender),
        prompt: prompt.prompt,
        parts: prompt.parts,
        sender: opts.sender,
        mappedSettings,
        user: opts.user,
        guest: guestSocketId,
        lines: prompt.lines,
        isThirdParty,
        replyAs: opts.replyAs,
        characters: opts.characters,
        impersonate: opts.impersonate,
        lastMessage: opts.lastMessage,
        imageData: opts.imageData,
        jsonSchema: jsonSchema || opts.jsonSchema,
        subscription,
        encoder,
        jsonValues: opts.jsonValues,
    });
    const priority = (0, queue_1.priorityForUser)(opts.user, !!guestSocketId, (0, subscriptions_1.getCachedTiers)());
    const gatedStream = queue_1.inferenceGate.gateStream({
        kind: 'text',
        priority,
        userId: guestSocketId ? undefined : opts.user._id,
        socketId: guestSocketId,
        requestId: opts.requestId,
    }, () => stream);
    return {
        stream: gatedStream,
        adapter,
        settings: gen,
        user: opts.user,
        size,
        length: prompt.length,
        json: !!jsonSchema || !!opts.jsonSchema,
    };
}
async function getResponseEntities(chat, senderId, gen) {
    const isOwnerOrMember = senderId === chat.userId || chat.memberIds.includes(senderId);
    if (!isOwnerOrMember) {
        throw wrap_1.errors.Forbidden;
    }
    const user = await db_1.store.users.getUser(chat.userId);
    if (!user) {
        throw wrap_1.errors.Forbidden;
    }
    const book = chat.memoryId ? await db_1.store.memory.getBook(chat.memoryId) : undefined;
    const char = await db_1.store.characters.getCharacter(chat.userId, chat.characterId);
    if (!char) {
        throw new wrap_1.StatusError('Character not found', 404);
    }
    const { adapter, model } = (0, prompt_1.getAdapter)(chat, user, gen);
    const genSettings = await getGenerationSettings(user, chat, adapter);
    const settings = (0, presets_1.mapPresetsToAdapter)(genSettings, adapter);
    // Scenario books (the retired event state-machine) no longer feed the prompt —
    // resolveScenario only uses the character's/chat's plain-text scenario now.
    const resolvedScenario = (0, prompt_1.resolveScenario)(chat, char, []);
    if (genSettings.promptTemplateId) {
        if ((0, templates_1.isDefaultTemplate)(genSettings.promptTemplateId)) {
            genSettings.gaslight = templates_1.templates[genSettings.promptTemplateId];
        }
        else {
            const template = await db_1.store.presets.getTemplate(genSettings.promptTemplateId);
            if (template?.userId === chat.userId) {
                genSettings.gaslight = template.template;
            }
        }
    }
    return { char, user, adapter, settings, gen: genSettings, model, book, resolvedScenario };
}
async function getGenerationSettings(user, chat, adapter, guest) {
    if (chat.genPreset) {
        if ((0, presets_1.isDefaultPreset)(chat.genPreset)) {
            return { ...presets_1.defaultPresets[chat.genPreset], src: 'user-chat-genpreset-default' };
        }
        if (guest) {
            if (chat.genSettings)
                return { ...chat.genSettings, src: 'guest-chat-gensettings' };
            return { ...(0, presets_1.getFallbackPreset)(adapter), src: 'guest-fallback' };
        }
        const preset = await db_1.store.presets.getUserPreset(chat.genPreset);
        if (preset) {
            preset.src = 'user-chat-genpreset-custom';
            return preset;
        }
    }
    if (chat.genSettings) {
        const src = guest ? 'guest-chat-gensettings' : 'user-chat-gensettings';
        return { ...chat.genSettings, src };
    }
    if (user.defaultPreset) {
        if ((0, presets_1.isDefaultPreset)(user.defaultPreset)) {
            return { ...presets_1.defaultPresets[user.defaultPreset], src: 'user-settings-genpreset-default' };
        }
        const preset = await db_1.store.presets.getUserPreset(user.defaultPreset);
        if (preset) {
            preset.src = 'user-settings-genpreset-custom';
            return preset;
        }
    }
    const servicePreset = user.defaultPresets?.[adapter];
    if (servicePreset) {
        if ((0, presets_1.isDefaultPreset)(servicePreset)) {
            return {
                ...presets_1.defaultPresets[servicePreset],
                src: `${guest ? 'guest' : 'user'}-service-defaultpreset`,
            };
        }
        // No user presets are persisted for anonymous users
        // Do not try to check the database for them
        if (guest) {
            return { ...(0, presets_1.getFallbackPreset)(adapter), src: 'guest-fallback' };
        }
        const preset = await db_1.store.presets.getUserPreset(servicePreset);
        if (preset) {
            preset.src = 'user-service-custom';
            return preset;
        }
    }
    return {
        ...(0, presets_1.getFallbackPreset)(adapter),
        src: guest ? 'guest-fallback-last' : 'user-fallback-last',
    };
}
//# sourceMappingURL=generate.js.map