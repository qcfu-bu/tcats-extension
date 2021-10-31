"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const cp = require("child_process");
const _ = require("lodash");
const os = require("os");
const vscode = require("vscode");
class TcatsLintingProvider {
    doTcats(textDocument) {
        if (textDocument.languageId !== 'ats') {
            return;
        }
        let outputString = '';
        let diagnostics = {};
        diagnostics[textDocument.fileName] = [];
        let cwd = path.dirname(textDocument.fileName);
        let fileName = path.basename(textDocument.fileName);
        let patscc = 'patscc';
        let args = ['-tcats', fileName];
        if (os.type() === 'Windows_NT') {
            patscc = 'wsl';
            args = ['patscc', '-tcats', fileName];
        }
        let options = { cwd: cwd };
        if (patscc) {
            let childProcess = cp.spawn(patscc, args, options);
            if (childProcess.pid) {
                console.log("pid: ", childProcess.pid);
                childProcess.stderr.on('data', (data) => {
                    outputString += data.toString();
                });
                childProcess.stdout.on('data', (data) => {
                    outputString += data.toString();
                });
                childProcess.on("exit", (code) => {
                    if (outputString.length > 0) {
                        let decoded;
                        if (outputString.toString().includes("**SHOWTYPE")) {
                            decoded = this.decodeShowType(outputString);
                        }
                        else {
                            decoded = this.decode(outputString);
                        }
                        decoded.forEach((item, index) => {
                            let diagnostic = new vscode.Diagnostic(item.loc, item.msg, item.error);
                            diagnostic.code = index.toString();
                            if (diagnostics[item.path]) {
                                diagnostics[item.path].push(diagnostic);
                            }
                            else {
                                diagnostics[item.path] = [diagnostic];
                            }
                        });
                        for (var key in diagnostics) {
                            let path = key.match(/\/mnt\/([^\/]*)(\/.*)/);
                            if (os.type() === 'Windows_NT' && path) {
                                let winPath = path[1] + ':' + path[2].replace(/\//g, '\\');
                                this.diagnosticCollection.set(vscode.Uri.file(winPath), diagnostics[key]);
                            }
                            else {
                                this.diagnosticCollection.set(vscode.Uri.file(key), diagnostics[key]);
                            }
                        }
                    }
                    else if (code !== 0) {
                        let loc = new vscode.Range(0, 0, 0, 0);
                        let diagnostic = new vscode.Diagnostic(loc, "fatal error", vscode.DiagnosticSeverity.Error);
                        this.diagnosticCollection.set(textDocument.uri, [diagnostic]);
                    }
                });
            }
            else {
                vscode.window.showErrorMessage(`failed to execute ${patscc} -tcats`);
            }
        }
        else {
            vscode.window.showErrorMessage(`failed to find ${patscc}`);
        }
    }
    getRangeFromRawString(str) {
        let rawLoc = str.match(/\d*\(line=(\d*), offs=(\d*)\) -- \d*\(line=(\d*), offs=(\d*)\)/).slice(1);
        let pos1 = new vscode.Position(parseInt(rawLoc[0]) - 1, parseInt(rawLoc[1]) - 1);
        let pos2 = new vscode.Position(parseInt(rawLoc[2]) - 1, parseInt(rawLoc[3]) - 1);
        return new vscode.Range(pos1, pos2);
    }
    decodeShowType(showTypeString) {
        let showTypeLines = showTypeString.trim().split("\n");
        let showTypeChunks = showTypeLines.map(x => x.split(/(\/[^:]*): ([^:]*): /));
        let decoded = [];
        showTypeChunks.forEach((item, index) => {
            let path = item[1];
            let msg = item[3];
            let loc = this.getRangeFromRawString(item[2]);
            decoded.push({ path: path, loc: loc, error: vscode.DiagnosticSeverity.Information, msg: msg });
        });
        return decoded;
    }
    decode(errorString) {
        errorString = "\n" + errorString.replace(/(?:patsopt.*\nexit.*)|(?:typecheck.*\nexit.*)|(?:exit\(.*\): .*)/, "");
        let errorStrings = errorString.split(/\n(\/[^:]*): ([^:]*): ([^:]*): /).filter(item => { return item !== ""; });
        let errorChunks = _.chunk(errorStrings, 4);
        let decoded = [];
        errorChunks.forEach((item, index) => {
            let path = item[0];
            let msg = item[3].replace(/\n*$/, "");
            let loc = this.getRangeFromRawString(item[1]);
            let error;
            if (/error.*/.test(item[2])) {
                error = vscode.DiagnosticSeverity.Error;
            }
            else {
                error = vscode.DiagnosticSeverity.Warning;
            }
            decoded.push({ path: path, loc: loc, error: error, msg: msg });
        });
        return decoded;
    }
    activate(subscriptions) {
        subscriptions.push(this);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
        vscode.workspace.onDidOpenTextDocument((document) => {
            this.doTcats(document);
        }, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument((document) => {
            this.doTcats(document);
        }, this);
        vscode.workspace.onDidChangeTextDocument((document) => {
            this.diagnosticCollection.clear();
        }, this);
        vscode.window.onDidChangeActiveTextEditor((textEditor) => {
            if (textEditor === null || textEditor === void 0 ? void 0 : textEditor.document) {
                this.diagnosticCollection.clear();
                this.doTcats(textEditor.document);
            }
        }, this);
        vscode.workspace.textDocuments.forEach((document) => {
            this.doTcats(document);
        }, this);
    }
    dispose() {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
exports.default = TcatsLintingProvider;
//# sourceMappingURL=tcatsprovider.js.map