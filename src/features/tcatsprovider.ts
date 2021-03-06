import * as path from 'path';
import * as cp from 'child_process';
import * as _ from 'lodash';
import * as os from 'os';

import * as vscode from 'vscode';

export default class TcatsLintingProvider {

    private diagnosticCollection!: vscode.DiagnosticCollection;

    private doTcats(textDocument: vscode.TextDocument) {
        if (textDocument.languageId !== 'ats') {
            return;
        }

        let errorString: string = '';
        let diagnostics: { [path: string]: vscode.Diagnostic[] } = {};
        diagnostics[textDocument.fileName] = [];

        let cwd = path.dirname(textDocument.fileName);
        let fileName = path.basename(textDocument.fileName);
        let patscc: string = 'patscc';
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
                childProcess.stderr.on('data', (data: Buffer) => {
                    errorString += data.toString();
                });
                // childProcess.on("exit", () => {
                //     console.log("exit");
                // });
                childProcess.on("exit", (code) => {
                    if (errorString.length > 0) {
                        let decoded = this.decode(errorString);
                        decoded.forEach((item, index) => {
                            let diagnostic = new vscode.Diagnostic(item.loc, item.msg, item.error);
                            diagnostic.code = index.toString();
                            if (diagnostics[item.path]) {
                                diagnostics[item.path].push(diagnostic);
                            } else {
                                diagnostics[item.path] = [diagnostic];
                            }
                        });
                        for (var key in diagnostics) {
                            let path = key.match(/\/mnt\/([^\/]*)(\/.*)/);
                            if (os.type() === 'Windows_NT' && path) {
                                let winPath = path[1] + ':' + path[2].replace(/\//g, '\\');
                                this.diagnosticCollection.set(vscode.Uri.file(winPath), diagnostics[key]);
                            } else {
                                this.diagnosticCollection.set(vscode.Uri.file(key), diagnostics[key]);
                            }
                        }
                    } else if (code !== 0) {
                        let loc = new vscode.Range(0, 0, 0, 0);
                        let diagnostic = new vscode.Diagnostic(loc, "fatal error", vscode.DiagnosticSeverity.Error);
                        this.diagnosticCollection.set(textDocument.uri, [diagnostic]);
                    }
                });
            } else {
                vscode.window.showErrorMessage(`failed to execute ${patscc} -tcats`);
            }
        } else {
            vscode.window.showErrorMessage(`failed to find ${patscc}`);
        }
    }

    private decode(errorString: string) {
        errorString = "\n" + errorString.replace(/(?:patsopt.*\nexit.*)|(?:typecheck.*\nexit.*)|(?:exit\(.*\): .*)/, "");
        let errorStrings: string[] = errorString.split(/\n(\/[^:]*): ([^:]*): ([^:]*): /).filter(item => { return item !== ""; });
        let errorChunks: string[][] = _.chunk<string>(errorStrings, 4);
        let decoded: { path: string, loc: vscode.Range, error: vscode.DiagnosticSeverity, msg: string }[] = [];
        errorChunks.forEach((item, index) => {
            let path = item[0];
            let msg = item[3].replace(/\n*$/, "");
            let rawLoc = item[1].match(/\d*\(line=(\d*), offs=(\d*)\) -- \d*\(line=(\d*), offs=(\d*)\)/)!.slice(1);

            let pos1 = new vscode.Position(parseInt(rawLoc[0]) - 1, parseInt(rawLoc[1]) - 1);
            let pos2 = new vscode.Position(parseInt(rawLoc[2]) - 1, parseInt(rawLoc[3]) - 1);
            let loc = new vscode.Range(pos1, pos2);

            let error: vscode.DiagnosticSeverity;
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

    public activate(subscriptions: vscode.Disposable[]) {
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
            if (textEditor?.document) {
                this.diagnosticCollection.clear();
                this.doTcats(textEditor.document);
            }
        }, this);
        vscode.workspace.textDocuments.forEach((document) => {
            this.doTcats(document);
        }, this);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}