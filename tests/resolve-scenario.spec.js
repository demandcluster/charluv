"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
require("./init");
const util_1 = require("./util");
const prompt_1 = require("/common/prompt");
const { chat, main, scenarioBook } = util_1.entities;
describe('Resolve scenario', () => {
    it('will use main character scenario when chat does not override characters', () => {
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: undefined, overrides: undefined }, { ...main, scenario: 'Main char scenario' }, []);
        (0, chai_1.expect)(actual).to.equal('Main char scenario');
    });
    it('will use chat scenario when chat override is on', () => {
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: 'Chat scenario', overrides: (0, util_1.toPersona)('Chat persona') }, { ...main, scenario: 'Main char scenario' }, []);
        (0, chai_1.expect)(actual).to.equal('Chat scenario');
    });
    it('ignores attached scenario books (the feature is disabled)', () => {
        const book = { ...scenarioBook, text: 'Additional scenario' };
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: undefined, overrides: undefined }, { ...main, scenario: 'Main char scenario' }, [book]);
        (0, chai_1.expect)(actual).to.equal('Main char scenario');
    });
    it('will not append additional scenarios to the overriding chat scenario', () => {
        const book = { ...scenarioBook, text: 'Additional scenario' };
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: 'Chat scenario', overrides: (0, util_1.toPersona)('Chat persona') }, { ...main, scenario: 'Main char scenario' }, [book]);
        (0, chai_1.expect)(actual).to.equal('Chat scenario');
    });
    it('ignores the overwrite flag on scenario books (the feature is disabled)', () => {
        const book = { ...scenarioBook, text: 'Overwritten scenario', overwriteCharacterScenario: true };
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: undefined, overrides: undefined }, { ...main, scenario: 'Main char scenario' }, [book]);
        (0, chai_1.expect)(actual).to.equal('Main char scenario');
    });
    it('will not overwrite chat scenario when override is on and the additional scenario has overwrite flag', () => {
        const book = { ...scenarioBook, text: 'Overwritten scenario', overwriteCharacterScenario: true };
        const actual = (0, prompt_1.resolveScenario)({ ...chat, scenario: 'Chat scenario', overrides: (0, util_1.toPersona)('Chat persona') }, { ...main, scenario: 'Main char scenario' }, [book]);
        (0, chai_1.expect)(actual).to.equal('Chat scenario');
    });
    it('uses the replying character for the progression stage when provided', () => {
        const speaker = {
            ...main,
            name: 'Speaker',
            progression: { kind: 'archetype', archetype: 'romantic' },
            xp: 100000,
        };
        const withSpeaker = (0, prompt_1.resolveScenario)({ ...chat, scenario: undefined, overrides: undefined }, { ...main, scenario: 'Scene', progression: undefined }, [], speaker);
        const withoutSpeaker = (0, prompt_1.resolveScenario)({ ...chat, scenario: undefined, overrides: undefined }, { ...main, scenario: 'Scene', progression: undefined }, []);
        // The speaker has a progression archetype + XP, so its stage token is prepended.
        (0, chai_1.expect)(withSpeaker).to.contain('LEVEL(');
        // The main char has no progression, so without a speaker no token appears.
        (0, chai_1.expect)(withoutSpeaker).to.not.contain('LEVEL(');
    });
});
//# sourceMappingURL=resolve-scenario.spec.js.map