"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const tcatsprovider_1 = require("./features/tcatsprovider");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    let linter = new tcatsprovider_1.default();
    linter.activate(context.subscriptions);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map