"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
const _ = require("lodash");
const vscode = require("vscode");
class TcatsLintingProvider {
    doTcats(textDocument) {
        if (textDocument.languageId !== 'ats') {
            return;
        }
        let errorString = '';
        let diagnostics = {};
        diagnostics[textDocument.uri.path] = [];
        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
        let args = ['-tcats', textDocument.fileName];
        let childProcess = cp.spawn('patscc', args, options);
        if (childProcess.pid) {
            childProcess.stderr.on('data', (data) => {
                errorString += data.toString();
            });
            childProcess.stderr.on('end', () => {
                let decoded = this.decode(errorString);
                decoded.forEach(item => {
                    let diagnostic = new vscode.Diagnostic(item.loc, item.msg, item.error);
                    if (diagnostics[item.path]) {
                        diagnostics[item.path].push(diagnostic);
                    }
                    else {
                        diagnostics[item.path] = [diagnostic];
                    }
                });
                for (var key in diagnostics) {
                    this.diagnosticCollection.set(vscode.Uri.file(key), diagnostics[key]);
                }
            });
        }
        else {
            vscode.window.showErrorMessage("failed to execute patscc -tcats");
        }
    }
    decode(errorString) {
        let errorStrings = errorString.split(/(\/[^:]*): ([^:]*): ([^:]*): /).filter(item => { return item !== ""; });
        let errorChunks = _.chunk(errorStrings, 4);
        let decoded = [];
        errorChunks.forEach(item => {
            let path = item[0];
            let msg = item[3].split(/(?:patsopt.*\nexit.*)|(?:typecheck.*\nexit.*)|(?:exit\(.*\): .*)/)[0];
            let rawLoc = item[1].match(/\d*\(line=(\d*), offs=(\d*)\) -- \d*\(line=(\d*), offs=(\d*)\)/).slice(1);
            let loc = new vscode.Range(parseInt(rawLoc[0]) - 1, parseInt(rawLoc[1]) - 1, parseInt(rawLoc[2]) - 1, parseInt(rawLoc[3]) - 1);
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
        vscode.workspace.onDidOpenTextDocument(this.doTcats, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument(this.doTcats, this);
        vscode.window.onDidChangeActiveTextEditor((textEditor) => {
            if (textEditor === null || textEditor === void 0 ? void 0 : textEditor.document) {
                this.diagnosticCollection.clear();
                this.doTcats(textEditor.document);
            }
        }, this);
        vscode.workspace.textDocuments.forEach(this.doTcats, this);
    }
    dispose() {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
exports.default = TcatsLintingProvider;
//# sourceMappingURL=tcatsprovider.js.map