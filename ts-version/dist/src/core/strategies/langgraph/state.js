"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMessages = void 0;
// LangGraph state reducer for messages
const addMessages = (current = [], update = []) => {
    return [...current, ...update];
};
exports.addMessages = addMessages;
//# sourceMappingURL=state.js.map