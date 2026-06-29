"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
require("./init");
const event_1 = require("/common/event");
describe('Event helpers', () => {
    it('exposes the fixed economy/cap constants', () => {
        (0, chai_1.expect)(event_1.EVENT_TURN_COST).to.equal(25);
        (0, chai_1.expect)(event_1.EVENT_MAX_REPLIES).to.equal(3);
    });
    it('builds a scene block naming the location, description and attendees', () => {
        const actual = (0, event_1.buildEventScenario)({
            location: 'nightclub',
            description: 'Saturday DJ night',
            names: ['Mia', 'Jade'],
        });
        (0, chai_1.expect)(actual).to.equal('Setting: nightclub. Event: Saturday DJ night. Present: Mia, Jade.');
    });
    it('constrains the speaker schema to present ids plus none', () => {
        const schema = (0, event_1.buildSpeakerSchema)(['a', 'b']);
        (0, chai_1.expect)(schema.properties.speaker.enum).to.deep.equal(['a', 'b', 'none']);
        (0, chai_1.expect)(schema.required).to.deep.equal(['speaker']);
    });
    it('includes the roster names and the addressing rule in the director prompt', () => {
        const prompt = (0, event_1.buildDirectorPrompt)({
            event: { location: 'bar', description: 'after work drinks' },
            roster: [{ id: 'a', name: 'Mia', hook: 'flirty bartender' }],
            recent: [{ name: 'You', text: 'Hey Mia' }],
            repliedThisTurn: [],
        });
        (0, chai_1.expect)(prompt).to.contain('Mia');
        (0, chai_1.expect)(prompt).to.contain('bar');
        (0, chai_1.expect)(prompt.toLowerCase()).to.contain('none');
    });
    it('includes the director note in the director prompt only when set', () => {
        const base = {
            event: { location: 'bar', description: 'after work drinks' },
            roster: [{ id: 'a', name: 'Mia', hook: 'flirty bartender' }],
            recent: [{ name: 'You', text: 'Hey Mia' }],
            repliedThisTurn: [],
        };
        (0, chai_1.expect)((0, event_1.buildDirectorPrompt)(base)).to.not.contain("Director's note");
        const withNote = (0, event_1.buildDirectorPrompt)({
            ...base,
            event: { ...base.event, note: 'keep it playful' },
        });
        (0, chai_1.expect)(withNote).to.contain("Director's note");
        (0, chai_1.expect)(withNote).to.contain('keep it playful');
    });
});
//# sourceMappingURL=event.spec.js.map