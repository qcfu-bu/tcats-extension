import * as path from 'path';
import * as cp from 'child_process';
import * as _ from 'lodash';
import * as url from 'url';

import * as vscode from 'vscode';

export default class TcatsLintingProvider {

	private diagnosticCollection!: vscode.DiagnosticCollection;

    private doTcats(textDocument: vscode.TextDocument) {

        if (textDocument.languageId !== 'ats') {
            return;
        }

        let errorString:string = '';
        let diagnostics: { [path: string]: vscode.Diagnostic[] } = {};
        diagnostics[textDocument.uri.path] = [];

        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
        let args = ['-tcats', textDocument.fileName];

        let childProcess = cp.spawn('patscc', args, options);
        if (childProcess.pid) {
            childProcess.stderr.on('data', (data: Buffer) => {
                errorString += data.toString();
            });
            childProcess.stderr.on('end', () => {
                let decoded = this.decode(errorString);
                decoded.forEach(item => {
                    let diagnostic = new vscode.Diagnostic(item.loc, item.msg, item.error);
                    if (diagnostics[item.path]) {
                        diagnostics[item.path].push(diagnostic);
                    } else {
                        diagnostics[item.path] = [diagnostic];
                    }
                });
                for (var key in diagnostics) {
                    this.diagnosticCollection.set(vscode.Uri.file(key), diagnostics[key]);
                }
            });
        } else {
	        vscode.window.showErrorMessage("failed to execute patscc -tcats");
        }
    }


    private decode(errorString: string) {
        let errorStrings:string[] = errorString.split(/(\/[^:]*): ([^:]*): ([^:]*): /).filter(item => {return item !== "";});
        let errorChunks:string[][] = _.chunk<string>(errorStrings, 4);
        let decoded: {path : string, loc : vscode.Range, error: vscode.DiagnosticSeverity, msg: string}[] = [];
        errorChunks.forEach(item => {
            let path = item[0];
            let msg = item[3].split(/(?:patsopt.*\nexit.*)|(?:typecheck.*\nexit.*)|(?:exit\(.*\): .*)/)[0];
            let rawLoc = item[1].match(/\d*\(line=(\d*), offs=(\d*)\) -- \d*\(line=(\d*), offs=(\d*)\)/)!.slice(1);
            let loc = new vscode.Range(parseInt(rawLoc[0])-1, parseInt(rawLoc[1])-1, parseInt(rawLoc[2])-1, parseInt(rawLoc[3])-1);
            let error:vscode.DiagnosticSeverity;
            if (/error.*/.test(item[2])) {
                error = vscode.DiagnosticSeverity.Error;
            }
            else {
                error = vscode.DiagnosticSeverity.Warning;
            }
            decoded.push({path: path, loc: loc, error: error, msg: msg});
        });
        return decoded;
    }

    public activate(subscriptions: vscode.Disposable[]) {
		subscriptions.push(this);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();

        vscode.workspace.onDidOpenTextDocument(this.doTcats, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument(this.doTcats, this);
        vscode.window.onDidChangeActiveTextEditor((textEditor) => {
            if (textEditor?.document) {
                this.diagnosticCollection.clear();
                this.doTcats(textEditor.document);
            }
        }, this);
        vscode.workspace.textDocuments.forEach(this.doTcats, this);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}