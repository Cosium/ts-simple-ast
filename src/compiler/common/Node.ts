﻿import * as ts from "typescript";
import CodeBlockWriter from "code-block-writer";
import * as errors from "./../../errors";
import {GlobalContainer} from "./../../GlobalContainer";
import {getNextNonWhitespacePos, getPreviousMatchingPos} from "./../../manipulation/textSeek";
import {insertIntoParent} from "./../../manipulation/insertion";
import {Disposable, TypeGuards, getTextFromStringOrWriter, ArrayUtils} from "./../../utils";
import {SourceFile} from "./../file";
import * as base from "./../base";
import {ConstructorDeclaration, MethodDeclaration} from "./../class";
import {FunctionDeclaration} from "./../function";
import {TypeAliasDeclaration} from "./../type";
import {InterfaceDeclaration} from "./../interface";
import {NamespaceDeclaration} from "./../namespace";
import {Symbol} from "./Symbol";

export class Node<NodeType extends ts.Node = ts.Node> implements Disposable {
    /** @internal */
    readonly global: GlobalContainer;
    /** @internal */
    private _compilerNode: NodeType | undefined;
    /** @internal */
    sourceFile: SourceFile;

    /**
     * Gets the underlying compiler node.
     */
    get compilerNode(): NodeType {
        if (this._compilerNode == null)
            throw new errors.InvalidOperationError("Attempted to get information from a node that was removed from the AST.");
        return this._compilerNode;
    }

    /**
     * Initializes a new instance.
     * @internal
     * @param global - Global container.
     * @param node - Underlying node.
     * @param sourceFile - Source file for the node.
     */
    constructor(
        global: GlobalContainer,
        node: NodeType,
        sourceFile: SourceFile
    ) {
        this.global = global;
        this._compilerNode = node;
        this.sourceFile = sourceFile;
    }

    /**
     * Releases the node and all its descendants from the cache and ast.
     * @internal
     */
    dispose() {
        for (const child of this.getChildren()) {
            child.dispose();
        }

        this.disposeOnlyThis();
    }

    /**
     * Release only this node from the cache and ast.
     * @internal
     */
    disposeOnlyThis() {
        this.global.compilerFactory.removeNodeFromCache(this);
        this._compilerNode = undefined;
    }

    /**
     * Sets the source file.
     * @internal
     * @param sourceFile - Source file to set.
     */
    setSourceFile(sourceFile: SourceFile) {
        this.sourceFile = sourceFile;
        for (const child of this.getChildren())
            child.setSourceFile(sourceFile);
    }

    /**
     * Gets the syntax kind.
     */
    getKind() {
        return this.compilerNode.kind;
    }

    /**
     * Gets the syntax kind name.
     */
    getKindName() {
        return ts.SyntaxKind[this.compilerNode.kind];
    }

    /**
     * Gets the compiler symbol.
     */
    getSymbol(): Symbol | undefined {
        const boundSymbol = (this.compilerNode as any).symbol as ts.Symbol | undefined;
        if (boundSymbol != null)
            return this.global.compilerFactory.getSymbol(boundSymbol);

        const typeChecker = this.global.typeChecker;
        const typeCheckerSymbol = typeChecker.getSymbolAtLocation(this);
        if (typeCheckerSymbol != null)
            return typeCheckerSymbol;

        const nameNode = (this.compilerNode as any).name as ts.Node | undefined;
        if (nameNode != null)
            return this.global.compilerFactory.getNodeFromCompilerNode(nameNode, this.sourceFile).getSymbol();

        return undefined;
    }

    /**
     * If the node contains the provided range (inclusive).
     * @param pos - Start position.
     * @param end - End position.
     */
    containsRange(pos: number, end: number) {
        return this.getPos() <= pos && end <= this.getEnd();
    }

    /**
     * Gets the first child by a condition or throws.
     * @param condition - Condition.
     */
    getFirstChildOrThrow(condition?: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getFirstChild(condition), "Could not find a child that matched the specified condition.");
    }

    /**
     * Gets the first child by a condition.
     * @param condition - Condition.
     */
    getFirstChild(condition?: (node: Node) => boolean) {
        for (const child of this.getChildrenIterator()) {
            if (condition == null || condition(child))
                return child;
        }
        return undefined;
    }

    /**
     * Gets the last child by a condition or throws.
     * @param condition - Condition.
     */
    getLastChildOrThrow(condition?: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getLastChild(condition), "Could not find a child that matched the specified condition.");
    }

    /**
     * Gets the last child by a condition.
     * @param condition - Condition.
     */
    getLastChild(condition?: (node: Node) => boolean) {
        for (const child of this.getChildren().reverse()) {
            if (condition == null || condition(child))
                return child;
        }
        return undefined;
    }

    /**
     * Gets the first descendant by a condition or throws.
     * @param condition - Condition.
     */
    getFirstDescendantOrThrow(condition?: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getFirstDescendant(condition), "Could not find a descendant that matched the specified condition.");
    }

    /**
     * Gets the first descendant by a condition.
     * @param condition - Condition.
     */
    getFirstDescendant(condition?: (node: Node) => boolean) {
        for (const descendant of this.getDescendantsIterator()) {
            if (condition == null || condition(descendant))
                return descendant;
        }
        return undefined;
    }

    /**
     * Offset this node's positions (pos and end) and all of its children by the given offset.
     * @internal
     * @param offset - Offset.
     */
    offsetPositions(offset: number) {
        this.compilerNode.pos += offset;
        this.compilerNode.end += offset;

        for (const child of this.getChildren()) {
            child.offsetPositions(offset);
        }
    }

    /**
     * Gets the previous sibling or throws.
     * @param condition - Optional condition for getting the previous sibling.
     */
    getPreviousSiblingOrThrow(condition?: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getPreviousSibling(condition), "Could not find the previous sibling.");
    }

    /**
     * Gets the previous sibling.
     * @param condition - Optional condition for getting the previous sibling.
     */
    getPreviousSibling(condition?: (node: Node) => boolean) {
        for (const sibling of this.getPreviousSiblings()) {
            if (condition == null || condition(sibling))
                return sibling;
        }

        return undefined;
    }

    /**
     * Gets the next sibling or throws.
     * @param condition - Optional condition for getting the next sibling.
     */
    getNextSiblingOrThrow(condition?: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getNextSibling(condition), "Could not find the next sibling.");
    }

    /**
     * Gets the next sibling.
     * @param condition - Optional condition for getting the previous sibling.
     */
    getNextSibling(condition?: (node: Node) => boolean) {
        for (const sibling of this.getNextSiblings()) {
            if (condition == null || condition(sibling))
                return sibling;
        }

        return undefined;
    }

    /**
     * Gets the previous siblings.
     *
     * Note: Closest sibling is the zero index.
     */
    getPreviousSiblings() {
        const parent = this.getParentSyntaxList() || this.getParentOrThrow();
        const previousSiblings: Node[] = [];

        for (const child of parent.getChildrenIterator()) {
            if (child === this)
                break;

            previousSiblings.splice(0, 0, child);
        }

        return previousSiblings;
    }

    /**
     * Gets the next siblings.
     *
     * Note: Closest sibling is the zero index.
     */
    getNextSiblings() {
        let foundChild = false;
        const nextSiblings: Node[] = [];
        const parent = this.getParentSyntaxList() || this.getParentOrThrow();

        for (const child of parent.getChildrenIterator()) {
            if (!foundChild) {
                foundChild = child === this;
                continue;
            }

            nextSiblings.push(child);
        }

        return nextSiblings;
    }

    /**
     * Gets the children of the node.
     */
    getChildren(): Node[] {
        return this.compilerNode.getChildren().map(n => this.global.compilerFactory.getNodeFromCompilerNode(n, this.sourceFile));
    }

    /**
     * @internal
     */
    *getChildrenIterator(): IterableIterator<Node> {
        for (const compilerChild of this.compilerNode.getChildren(this.sourceFile.compilerNode)) {
            yield this.global.compilerFactory.getNodeFromCompilerNode(compilerChild, this.sourceFile);
        }
    }

    /**
     * Gets the child syntax list or throws if it doesn't exist.
     */
    getChildSyntaxListOrThrow() {
        return errors.throwIfNullOrUndefined(this.getChildSyntaxList(), "A child syntax list was expected.");
    }

    /**
     * Gets the child syntax list if it exists.
     */
    getChildSyntaxList(): Node | undefined {
        let node: Node = this;
        if (TypeGuards.isBodyableNode(node) || TypeGuards.isBodiedNode(node)) {
            do {
                node = TypeGuards.isBodyableNode(node) ? node.getBodyOrThrow() : node.getBody();
            } while ((TypeGuards.isBodyableNode(node) || TypeGuards.isBodiedNode(node)) && (node.compilerNode as ts.Block).statements == null);
        }

        if (TypeGuards.isSourceFile(node) || TypeGuards.isBodyableNode(this) || TypeGuards.isBodiedNode(this))
            return node.getFirstChildByKind(ts.SyntaxKind.SyntaxList);

        let passedBrace = false;
        for (const child of node.getChildrenIterator()) {
            if (!passedBrace)
                passedBrace = child.getKind() === ts.SyntaxKind.FirstPunctuation;
            else if (child.getKind() === ts.SyntaxKind.SyntaxList)
                return child;
        }

        return undefined;
    }

    /**
     * Gets the node's descendants.
     */
    getDescendants(): Node[] {
        return ArrayUtils.from(this.getDescendantsIterator());
    }

    /**
     * Gets the node's descendants as an iterator.
     * @internal
     */
    *getDescendantsIterator(): IterableIterator<Node> {
        for (const child of this.getChildrenIterator()) {
            yield child;

            for (const childChild of child.getDescendantsIterator())
                yield childChild;
        }
    }

    /**
     * Gets the child count.
     */
    getChildCount() {
        return this.compilerNode.getChildCount(this.sourceFile.compilerNode);
    }

    /**
     * Gets the child at the provided position, or undefined if not found.
     * @param pos - Position to search for.
     */
    getChildAtPos(pos: number): Node | undefined {
        if (pos < this.getPos() || pos >= this.getEnd())
            return undefined;

        for (const child of this.getChildrenIterator()) {
            if (pos >= child.getPos() && pos < child.getEnd())
                return child;
        }

        return undefined;
    }

    /**
     * Gets the most specific descendant at the provided position, or undefined if not found.
     * @param pos - Position to search for.
     */
    getDescendantAtPos(pos: number): Node | undefined {
        let node: Node | undefined;

        while (true) {
            const nextNode: Node | undefined = (node || this).getChildAtPos(pos);
            if (nextNode == null)
                return node;
            else
                node = nextNode;
        }
    }

    /**
     * Gets the most specific descendant at the provided start position with the specified width, or undefined if not found.
     * @param start - Start position to search for.
     * @param width - Width of the node to search for.
     */
    getDescendantAtStartWithWidth(start: number, width: number): Node | undefined {
        let nextNode: Node | undefined = this.getSourceFile();
        let foundNode: Node | undefined;

        do {
            nextNode = nextNode.getChildAtPos(start);
            if (nextNode != null) {
                if (nextNode.getStart() === start && nextNode.getWidth() === width)
                    foundNode = nextNode;
                else if (foundNode != null)
                    break; // no need to keep looking
            }
        } while (nextNode != null);

        return foundNode;
    }

    /**
     * Gets the start position with leading trivia.
     */
    getPos() {
        return this.compilerNode.pos;
    }

    /**
     * Gets the end position.
     */
    getEnd() {
        return this.compilerNode.end;
    }

    /**
     * Gets the start position without leading trivia.
     */
    getStart() {
        return this.compilerNode.getStart(this.sourceFile.compilerNode);
    }

    /**
     * Gets the first position that is not whitespace.
     */
    getNonWhitespaceStart() {
        return getNextNonWhitespacePos(this.sourceFile.getFullText(), this.getPos());
    }

    /**
     * Gets the width of the node (length without trivia).
     */
    getWidth() {
        return this.compilerNode.getWidth(this.sourceFile.compilerNode);
    }

    /**
     * Gets the full width of the node (length with trivia).
     */
    getFullWidth() {
        return this.compilerNode.getFullWidth();
    }

    /**
     * Gets the text without leading trivia.
     */
    getText() {
        return this.compilerNode.getText(this.sourceFile.compilerNode);
    }

    /**
     * Gets the full text with leading trivia.
     */
    getFullText() {
        return this.compilerNode.getFullText(this.sourceFile.compilerNode);
    }

    /**
     * Gets the combined modifier flags.
     */
    getCombinedModifierFlags() {
        return ts.getCombinedModifierFlags(this.compilerNode);
    }

    /**
     * @internal
     */
    replaceCompilerNode(compilerNode: NodeType) {
        this._compilerNode = compilerNode;
    }

    /**
     * Gets the source file.
     */
    getSourceFile(): SourceFile {
        return this.sourceFile;
    }

    /**
     * Gets a compiler node property wrapped in a Node.
     * @param propertyName - Property name.
     */
    getNodeProperty<KeyType extends keyof NodeType>(propertyName: KeyType): Node<NodeType[KeyType]> {
        // todo: once filtering keys by type is supported need to (1) make this only show keys that are of type ts.Node and (2) have ability to return an array of nodes.
        if ((this.compilerNode[propertyName] as any).kind == null)
            throw new errors.InvalidOperationError(`Attempted to get property '${propertyName}', but ${nameof<this>(n => n.getNodeProperty)} ` +
                `only works with properties that return a node.`);
        return this.global.compilerFactory.getNodeFromCompilerNode(this.compilerNode[propertyName], this.sourceFile) as Node<NodeType[KeyType]>;
    }

    /**
     * Goes up the tree getting all the parents in ascending order.
     */
    getAncestors() {
        return ArrayUtils.from(this.getAncestorsIterator());
    }

    /**
     * @internal
     */
    *getAncestorsIterator() {
        let parent = (this as Node).getParent();
        while (parent != null) {
            yield parent;
            parent = parent!.getParent();
        }
    }

    /**
     * Get the node's parent.
     */
    getParent() {
        return (this.compilerNode.parent == null) ? undefined : this.global.compilerFactory.getNodeFromCompilerNode(this.compilerNode.parent, this.sourceFile);
    }

    /**
     * Gets the parent or throws an error if it doesn't exist.
     */
    getParentOrThrow() {
        return errors.throwIfNullOrUndefined(this.getParent(), "A parent is required to do this operation.");
    }

    /**
     * Goes up the parents (ancestors) of the node while a condition is true.
     * Throws if the initial parent doesn't match the condition.
     * @param condition - Condition that tests the parent to see if the expression is true.
     */
    getParentWhileOrThrow(condition: (node: Node) => boolean) {
        return errors.throwIfNullOrUndefined(this.getParentWhile(condition), "The initial parent did not match the provided condition.");
    }

    /**
     * Goes up the parents (ancestors) of the node while a condition is true.
     * Returns undefined if the initial parent doesn't match the condition.
     * @param condition - Condition that tests the parent to see if the expression is true.
     */
    getParentWhile(condition: (node: Node) => boolean) {
        let node: Node | undefined = undefined;
        let nextParent = this.getParent();
        while (nextParent != null && condition(nextParent)) {
            node = nextParent;
            nextParent = nextParent.getParent();
        }

        return node;
    }

    /**
     * Goes up the parents (ancestors) of the node while the parent is the specified syntax kind.
     * Throws if the initial parent is not the specified syntax kind.
     * @param kind - Syntax kind to check for.
     */
    getParentWhileKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getParentWhileKind(kind), `The initial parent was not a syntax kind of ${ts.SyntaxKind[kind]}.`);
    }

    /**
     * Goes up the parents (ancestors) of the node while the parent is the specified syntax kind.
     * Returns undefined if the initial parent is not the specified syntax kind.
     * @param kind - Syntax kind to check for.
     */
    getParentWhileKind(kind: ts.SyntaxKind) {
        return this.getParentWhile(n => n.getKind() === kind);
    }

    /**
     * Gets the last token of this node. Usually this is a close brace.
     */
    getLastToken() {
        const lastToken = this.compilerNode.getLastToken(this.sourceFile.compilerNode);
        if (lastToken == null)
            throw new errors.NotImplementedError("Not implemented scenario where the last token does not exist.");

        return this.global.compilerFactory.getNodeFromCompilerNode(lastToken, this.sourceFile);
    }

    /**
     * Gets if this node is in a syntax list.
     */
    isInSyntaxList() {
        return this.getParentSyntaxList() != null;
    }

    /**
     * Gets the parent if it's a syntax list or throws an error otherwise.
     */
    getParentSyntaxListOrThrow() {
        return errors.throwIfNullOrUndefined(this.getParentSyntaxList(), "Expected the parent to be a syntax list.");
    }

    /**
     * Gets the parent if it's a syntax list.
     */
    getParentSyntaxList() {
        const parent = this.getParent();
        if (parent == null)
            return undefined;

        const pos = this.getPos();
        const end = this.getEnd();
        for (const child of parent.getChildren()) {
            if (child.getPos() > pos || child === this)
                return undefined;

            if (child.getKind() === ts.SyntaxKind.SyntaxList && child.getPos() <= pos && child.getEnd() >= end)
                return child;
        }

        return undefined; // shouldn't happen
    }

    /**
     * Gets the child index of this node relative to the parent.
     */
    getChildIndex() {
        const parent = this.getParentSyntaxList() || this.getParentOrThrow();
        let i = 0;
        for (const child of parent.getChildren()) {
            if (child === this)
                return i;
            i++;
        }

        /* istanbul ignore next */
        throw new errors.NotImplementedError("For some reason the child's parent did not contain the child.");
    }

    /**
     * Gets the indentation text.
     */
    getIndentationText() {
        const sourceFileText = this.sourceFile.getFullText();
        const startLinePos = this.getStartLinePos();
        const startPos = this.getStart();
        let text = "";

        for (let i = startPos - 1; i >= startLinePos; i--) {
            const currentChar = sourceFileText[i];
            switch (currentChar) {
                case " ":
                case "\t":
                    text = currentChar + text;
                    break;
                case "\n":
                    return text;
                default:
                    text = "";
            }
        }

        return text;
    }

    /**
     * Gets the next indentation level text.
     */
    getChildIndentationText() {
        if (TypeGuards.isSourceFile(this))
            return "";

        return this.getIndentationText() + this.global.manipulationSettings.getIndentationText();
    }

    /**
     * Gets the position of the start of the line that this node starts on.
     */
    getStartLinePos() {
        const sourceFileText = this.sourceFile.getFullText();
        return getPreviousMatchingPos(sourceFileText, this.getStart(), char => char === "\n");
    }

    /**
     * Gets if this is the first node on the current line.
     */
    isFirstNodeOnLine() {
        const sourceFileText = this.sourceFile.getFullText();
        const startPos = this.getStart();

        for (let i = startPos - 1; i >= 0; i--) {
            const currentChar = sourceFileText[i];
            if (currentChar === " " || currentChar === "\t")
                continue;
            if (currentChar === "\n")
                return true;

            return false;
        }

        return false;
    }

    /**
     * Replaces the text of the current node with new text.
     *
     * This will dispose the current node and return a new node that can be asserted or type guarded to the correct type.
     * @param writerFunction - Write the text using the provided writer.
     * @returns The new node.
     */
    replaceWithText(writerFunction: (writer: CodeBlockWriter) => void): Node;
    /**
     * Replaces the text of the current node with new text.
     *
     * This will dispose the current node and return a new node that can be asserted or type guarded to the correct type.
     * @param text - Text to replace with.
     * @returns The new node.
     */
    replaceWithText(text: string): Node;
    replaceWithText(textOrWriterFunction: string | ((writer: CodeBlockWriter) => void)) {
        const newText = getTextFromStringOrWriter(this.global.manipulationSettings, textOrWriterFunction);
        if (TypeGuards.isSourceFile(this)) {
            this.replaceText([this.getPos(), this.getEnd()], newText);
            return this;
        }

        const parent = this.getParentSyntaxList() || this.getParentOrThrow();
        const childIndex = this.getChildIndex();

        try {
            insertIntoParent({
                parent,
                childIndex,
                insertItemsCount: 1,
                insertPos: this.getStart(),
                newText,
                replacing: {
                    nodes: [this],
                    textLength: this.getWidth()
                }
            });
        } catch (err) {
            throw new errors.InvalidOperationError(`${nameof<Node>(n => n.replaceWithText)} currently only supports replacing the current node ` +
                `with a single new node. If you need the ability to replace it with multiple nodes, then please open an issue.\n\nInner error: ` + err);
        }

        return parent.getChildren()[childIndex];
    }

    /**
     * Gets the children based on a kind.
     * @param kind - Syntax kind.
     */
    getChildrenOfKind(kind: ts.SyntaxKind) {
        return this.getChildren().filter(c => c.getKind() === kind);
    }

    /**
     * Gets the first child by syntax kind or throws an error if not found.
     * @param kind - Syntax kind.
     */
    getFirstChildByKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getFirstChildByKind(kind), `A child of the kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the first child by syntax kind.
     * @param kind - Syntax kind.
     */
    getFirstChildByKind(kind: ts.SyntaxKind) {
        return this.getFirstChild(child => child.getKind() === kind);
    }

    /**
     * Gets the first child if it matches the specified syntax kind or throws an error if not found.
     * @param kind - Syntax kind.
     */
    getFirstChildIfKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getFirstChildIfKind(kind), `A first child of the kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the first child if it matches the specified syntax kind.
     * @param kind - Syntax kind.
     */
    getFirstChildIfKind(kind: ts.SyntaxKind) {
        const firstChild = this.getFirstChild();
        return firstChild != null && firstChild.getKind() === kind ? firstChild : undefined;
    }

    /**
     * Gets the last child by syntax kind or throws an error if not found.
     * @param kind - Syntax kind.
     */
    getLastChildByKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getLastChildByKind(kind), `A child of the kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the last child by syntax kind.
     * @param kind - Syntax kind.
     */
    getLastChildByKind(kind: ts.SyntaxKind) {
        return this.getLastChild(child => child.getKind() === kind);
    }

    /**
     * Gets the last child if it matches the specified syntax kind or throws an error if not found.
     * @param kind - Syntax kind.
     */
    getLastChildIfKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getLastChildIfKind(kind), `A last child of the kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the last child if it matches the specified syntax kind.
     * @param kind - Syntax kind.
     */
    getLastChildIfKind(kind: ts.SyntaxKind) {
        const lastChild = this.getLastChild();
        return lastChild != null && lastChild.getKind() === kind ? lastChild : undefined;
    }

    /**
     * Gets the previous sibiling if it matches the specified kind, or throws.
     * @param kind - Kind to check.
     */
    getPreviousSiblingIfKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getPreviousSiblingIfKind(kind), `A previous sibling of kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the next sibiling if it matches the specified kind, or throws.
     * @param kind - Kind to check.
     */
    getNextSiblingIfKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getNextSiblingIfKind(kind), `A next sibling of kind ${ts.SyntaxKind[kind]} was expected.`);
    }

    /**
     * Gets the previous sibling if it matches the specified kind.
     * @param kind - Kind to check.
     */
    getPreviousSiblingIfKind(kind: ts.SyntaxKind) {
        const previousSibling = this.getPreviousSibling();
        return previousSibling != null && previousSibling.getKind() === kind ? previousSibling : undefined;
    }

    /**
     * Gets the next sibling if it matches the specified kind.
     * @param kind - Kind to check.
     */
    getNextSiblingIfKind(kind: ts.SyntaxKind) {
        const nextSibling = this.getNextSibling();
        return nextSibling != null && nextSibling.getKind() === kind ? nextSibling : undefined;
    }

    /**
     * Gets the parent if it's a certain syntax kind.
     */
    getParentIfKind(kind: ts.SyntaxKind) {
        const parentNode = this.getParent();
        return parentNode == null || parentNode.getKind() !== kind ? undefined : parentNode;
    }

    /**
     * Gets the parent if it's a certain syntax kind of throws.
     */
    getParentIfKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getParentIfKind(kind), `A parent with a syntax kind of ${ts.SyntaxKind[kind]} is required to do this operation.`);
    }

    /**
     * Gets the first ancestor by syntax kind or throws if not found.
     * @param kind - Syntax kind.
     */
    getFirstAncestorByKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getFirstAncestorByKind(kind), `A parent of kind ${ts.SyntaxKind[kind]} is required to do this operation.`);
    }

    /**
     * Get the first ancestor by syntax kind.
     * @param kind - Syntax kind.
     */
    getFirstAncestorByKind(kind: ts.SyntaxKind) {
        for (const parent of this.getAncestors()) {
            if (parent.getKind() === kind)
                return parent;
        }
        return undefined;
    }

    /**
     * Gets the descendants that match a specified syntax kind.
     * @param kind - Kind to check.
     */
    getDescendantsOfKind(kind: ts.SyntaxKind) {
        return this.getDescendants().filter(c => c.getKind() === kind);
    }

    /**
     * Gets the first descendant by syntax kind or throws.
     * @param kind - Syntax kind.
     */
    getFirstDescendantByKindOrThrow(kind: ts.SyntaxKind) {
        return errors.throwIfNullOrUndefined(this.getFirstDescendantByKind(kind), `A descendant of kind ${ts.SyntaxKind[kind]} is required to do this operation.`);
    }

    /**
     * Gets the first descendant by syntax kind.
     * @param kind - Syntax kind.
     */
    getFirstDescendantByKind(kind: ts.SyntaxKind) {
        for (const descendant of this.getDescendantsIterator()) {
            if (descendant.getKind() === kind)
                return descendant;
        }
        return undefined;
    }
}
