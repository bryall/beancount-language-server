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
            this.connection.languages.semanticTokens.onRange(
                this.handleSemanticRange.bind(this)
            );
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

    protected getTokenBuilder(document: TextDocument): SemanticTokensBuilder {
        let result = this.tokenBuilders.get(document.uri);
        if (result !== undefined) {
            return result;
        }
        result = new SemanticTokensBuilder();
        this.tokenBuilders.set(document.uri, result);
        return result;
    }

    protected buildTokens(builder: SemanticTokensBuilder, document: TextDocument) {
        const text = document.getText();
        //const regexp = /\w+/g;
        //let match: RegExpMatchArray;
        //let tokenCounter: number = 0;
        //let modifierCounter: number = 0;
        //while ((match = regexp.exec(text)) !== null) {
        //    const word = match[0];
        //    const position = document.positionAt(match.index);
        //    const tokenType = tokenCounter % TokenTypes._;
        //    const tokenModifier = 1 << modifierCounter % TokenModifiers._;
        //    builder.push(position.line, position.character, word.length, tokenType, tokenModifier);
        //    tokenCounter++;
        //    modifierCounter++;
        //}
    }

    private handleSemantic(
        params: SemanticTokensParams
    ): SemanticTokens {
        const document = this.documentEvents.get(params.textDocument.uri)
        if (document === undefined) {
            return {
                data: []
            };
        }
        const builder = this.getTokenBuilder(document)
        this.buildTokens(builder, document);
        return builder.build();
    }

    protected handleSemanticDelta(
        params: SemanticTokensDeltaParams
    ): SemanticTokens {
        const document = this.documentEvents.get(params.textDocument.uri)
        if (document === undefined) {
            return {
                data: []
            };
        }
        const builder = this.getTokenBuilder(document)
        builder.previousResult(params.previousResultId)
        this.buildTokens(builder, document);
        return builder.build();
    }

    protected handleSemanticRange(
        params: SemanticTokensRangeParams
    ): SemanticTokens {
        return { data: [] };
    }
}

export namespace SemanticTokensProvider {
    export enum TokenTypes {
        comment = 0,
        keyword = 1,
        string = 2,
        number = 3,
        type = 5,
        class = 6,
        interface = 7,
        enum = 8,
        typeParameter = 9,
        function = 10,
        member = 11,
        property = 12,
        variable = 13,
        parameter = 14,
        _ = 16
    }

    export enum TokenModifiers {
        abstract = 0,
        deprecated = 1,
        _ = 2,
    }
}
