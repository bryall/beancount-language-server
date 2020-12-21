import {
    Connection,
    DocumentFormattingParams,
    TextEdit,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensClientCapabilities,
    SemanticTokensRegistrationOptions,
    SemanticTokensRegistrationType,
    SemanticTokensParams,
    SemanticTokensDeltaParams,
    SemanticTokensRangeParams,
    SemanticTokensLegend
} from 'vscode-languageserver'
import {
    TextDocument,
    Position,
    Range
} from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { readFileSync } from 'fs';
import { container } from 'tsyringe';
import * as path from 'path'
import Parser, { Edit, Language, Point, Query, QueryResult, SyntaxNode, Tree } from 'web-tree-sitter'

import { Forest } from '../forest'
import { TextDocumentEvents } from '../utils/textDocumentEvents'
import { Settings } from '../utils/settings'
import { compareTSPositions } from '../utils/positionUtils'


interface TSRange {
    start: Point
    end: Point
}
interface Match {
    prefix: TSRange | null;
    number: TSRange | null;
}


export class SemanticTokensProvider {
    private connection: Connection;
    private documentEvents: TextDocumentEvents;
    private settings: Settings;

    private semanticTokensLegend: SemanticTokensLegend | undefined;

    private tokenBuilders: Map<string, SemanticTokensBuilder>;

    constructor(capabilities: SemanticTokensClientCapabilities | undefined) {
        this.connection = container.resolve("Connection");
        this.documentEvents = container.resolve("TextDocumentEvents");
        this.settings = container.resolve("Settings");

        this.tokenBuilders = new Map();

        if (capabilities) {
            this.semanticTokensLegend = this.computeLegend(capabilities);

            this.connection.onInitialized(this.handleInitialized.bind(this));

            this.connection.languages.semanticTokens.on(
                this.handleSemantic.bind(this)
            );
            this.connection.languages.semanticTokens.onDelta(
                this.handleSemanticDelta.bind(this)
            );
            //this.connection.languages.semanticTokens.onRange(
            //    this.handleSemanticRange.bind(this)
            //);
        }

    }

    protected computeLegend(
        capability: SemanticTokensClientCapabilities
    ): SemanticTokensLegend {

        const clientTokenTypes = new Set<string>(capability.tokenTypes);
        const clientTokenModifiers = new Set<string>(capability.tokenModifiers);

        const tokenTypes: string[] = [];
        for (let i = 0; i < SemanticTokensProvider.TokenTypes._; i++) {
            const str = SemanticTokensProvider.TokenTypes[i];
            if (clientTokenTypes.has(str)) {
                tokenTypes.push(str);
            }
        }

        const tokenModifiers: string[] = [];
        for (let i = 0; i < SemanticTokensProvider.TokenModifiers._; i++) {
            const str = SemanticTokensProvider.TokenModifiers[i];
            if (clientTokenModifiers.has(str)) {
                tokenModifiers.push(str)
            }
        }

        return { tokenTypes, tokenModifiers };
    }

    protected handleInitialized() {
        const registrationOptions: SemanticTokensRegistrationOptions = {
            documentSelector: ['bat'],
            legend: this.semanticTokensLegend!,
            range: true,
            full: {
                delta: true
            }
        }
        this.connection.client.register(
            SemanticTokensRegistrationType.type, registrationOptions
        );
    }

    protected getTokenBuilder(uri: string): SemanticTokensBuilder {
        let result = this.tokenBuilders.get(uri);
        if (result !== undefined) {
            return result;
        }
        result = new SemanticTokensBuilder();
        this.tokenBuilders.set(uri, result);
        return result;
    }

    protected buildTokens(builder: SemanticTokensBuilder, tree: Tree) {
        const treeCursor = tree.walk();

        const traverse = function(): void {
            const node = treeCursor.currentNode();

            if (node.type == "date") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.number,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "txn") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.property,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "account") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.type,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "amount") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.number,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "incomplete_amount") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.number,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "currency") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.property,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "key") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.label,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "string") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.string,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "tag") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.constant,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }
            else if (node.type == "comment") {
                builder.push(
                    node.startPosition.row,
                    node.startPosition.column,
                    node.text.length,
                    SemanticTokensProvider.TokenTypes.comment,
                    SemanticTokensProvider.TokenModifiers.abstract
                )
            }

            if (treeCursor.gotoFirstChild()) {
                traverse();

                while (treeCursor.gotoNextSibling()) {
                    traverse();
                }

                treeCursor.gotoParent();
            }
        }
        //    builder.push(position.line, position.character, word.length, tokenType, tokenModifier);
    }

    private handleSemantic(
        params: SemanticTokensParams
    ): SemanticTokens {
        const uri = params.textDocument.uri
        const forest = container.resolve<Forest>("Forest")
        const treeContainer = forest.getByUri(uri)
        if (treeContainer === undefined) {
            return {
                data: []
            };
        }
        const builder = this.getTokenBuilder(uri)
        this.buildTokens(builder, treeContainer.tree);
        return builder.build();
    }

    protected handleSemanticDelta(
        params: SemanticTokensDeltaParams
    ): SemanticTokens {
        const uri = params.textDocument.uri
        const forest = container.resolve<Forest>("Forest")
        const treeContainer = forest.getByUri(uri)
        if (treeContainer === undefined) {
            return {
                data: []
            };
        }
        const builder = this.getTokenBuilder(uri)
        builder.previousResult(params.previousResultId)
        this.buildTokens(builder, treeContainer.tree);
        return builder.build();
    }

    //protected handleSemanticRange(
    //    params: SemanticTokensRangeParams
    //): SemanticTokens {
    //    return { data: [] };
    //}
}

export namespace SemanticTokensProvider {
    export enum TokenTypes {
        comment = 0,
        keyword = 1,
        string = 2,
        number = 3,
        type = 4,
        property = 5,
        parameter = 6,
        label = 7,
        constant = 8,
        _ = 16
    }

    export enum TokenModifiers {
        abstract = 0,
        deprecated = 1,
        _ = 2,
    }
}
