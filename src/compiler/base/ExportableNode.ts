﻿import * as ts from "typescript";
import {Constructor} from "./../../Constructor";
import * as errors from "./../../errors";
import {removeChildrenWithFormatting, FormattingKind} from "./../../manipulation";
import {ExportableNodeStructure} from "./../../structures";
import {TypeGuards} from "./../../utils";
import {callBaseFill} from "./../callBaseFill";
import {Node} from "./../common";
import {ModifierableNode} from "./ModifierableNode";

export type ExportableNodeExtensionType = Node & ModifierableNode;

export interface ExportableNode {
    /**
     * If the node has the export keyword.
     */
    hasExportKeyword(): boolean;
    /**
     * Gets the export keyword or undefined if none exists.
     */
    getExportKeyword(): Node | undefined;
    /**
     * Gets the export keyword or throws if none exists.
     */
    getExportKeywordOrThrow(): Node;
    /**
     * If the node has the default keyword.
     */
    hasDefaultKeyword(): boolean;
    /**
     * Gets the default keyword or undefined if none exists.
     */
    getDefaultKeyword(): Node | undefined;
    /**
     * Gets the default keyword or throws if none exists.
     */
    getDefaultKeywordOrThrow(): Node;
    /**
     * Gets if this node is a default export of a file.
     */
    isDefaultExport(): boolean;
    /**
     * Gets if this node is a named export of a file.
     */
    isNamedExport(): boolean;
    /**
     * Sets if this node is a default export of a file.
     * @param value - If it should be a default export or not.
     */
    setIsDefaultExport(value: boolean): this;
    /**
     * Sets if the node is exported.
     * Note: Will always remove the default export if set.
     * @param value - If it should be exported or not.
     */
    setIsExported(value: boolean): this;
}

export function ExportableNode<T extends Constructor<ExportableNodeExtensionType>>(Base: T): Constructor<ExportableNode> & T {
    return class extends Base implements ExportableNode {
        hasExportKeyword() {
            return this.getExportKeyword() != null;
        }

        getExportKeyword() {
            return this.getFirstModifierByKind(ts.SyntaxKind.ExportKeyword);
        }

        getExportKeywordOrThrow() {
            return errors.throwIfNullOrUndefined(this.getExportKeyword(), "Expected to find an export keyword.");
        }

        hasDefaultKeyword() {
            return this.getDefaultKeyword() != null;
        }

        getDefaultKeyword() {
            return this.getFirstModifierByKind(ts.SyntaxKind.DefaultKeyword);
        }

        getDefaultKeywordOrThrow() {
            return errors.throwIfNullOrUndefined(this.getDefaultKeyword(), "Expected to find a default keyword.");
        }

        isDefaultExport() {
            if (this.hasDefaultKeyword())
                return true;

            const thisSymbol = this.getSymbol();
            const defaultExportSymbol = this.getSourceFile().getDefaultExportSymbol();

            if (defaultExportSymbol == null || thisSymbol == null)
                return false;

            if (thisSymbol.equals(defaultExportSymbol))
                return true;

            const aliasedSymbol = defaultExportSymbol.getAliasedSymbol();
            return thisSymbol.equals(aliasedSymbol);
        }

        isNamedExport() {
            const parentNode = this.getParentOrThrow();
            return TypeGuards.isSourceFile(parentNode) && this.hasExportKeyword() && !this.hasDefaultKeyword();
        }

        setIsDefaultExport(value: boolean) {
            if (value === this.isDefaultExport())
                return this;

            if (value && !TypeGuards.isSourceFile(this.getParentOrThrow()))
                throw new errors.InvalidOperationError("The parent must be a source file in order to set this node as a default export.");

            // remove any existing default export
            const sourceFile = this.getSourceFile();
            const fileDefaultExportSymbol = sourceFile.getDefaultExportSymbol();

            if (fileDefaultExportSymbol != null)
                sourceFile.removeDefaultExport(fileDefaultExportSymbol);

            // set this node as the one to default export
            if (value) {
                this.addModifier("export");
                this.addModifier("default");
            }

            return this;
        }

        setIsExported(value: boolean) {
            // remove the default export if it is one no matter what
            if (TypeGuards.isSourceFile(this.getParentOrThrow()))
                this.setIsDefaultExport(false);

            this.toggleModifier("export", value);

            return this;
        }

        fill(structure: Partial<ExportableNodeStructure>) {
            callBaseFill(Base.prototype, this, structure);

            if (structure.isExported != null)
                this.setIsExported(structure.isExported);
            if (structure.isDefaultExport != null)
                this.setIsDefaultExport(structure.isDefaultExport);

            return this;
        }
    };
}
