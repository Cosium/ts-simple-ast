﻿import {Node} from "./../../compiler";
import {replaceTreeWithChildIndex} from "./../tree";
import {getNewReplacementSourceFile} from "./../getNewReplacementSourceFile";

export interface InsertIntoParentOptions {
    insertPos: number;
    newText: string;
    parent: Node;
    childIndex: number;
    insertItemsCount: number;
    replacing?: {
        textLength: number;
        nodes: Node[];
    };
}

export function insertIntoParent(opts: InsertIntoParentOptions) {
    const {insertPos, newText, parent, childIndex, insertItemsCount} = opts;
    const tempSourceFile = getNewReplacementSourceFile({
        sourceFile: parent.getSourceFile(),
        insertPos,
        newText,
        replacingLength: opts.replacing == null ? undefined : opts.replacing.textLength
    });

    replaceTreeWithChildIndex({
        parent,
        childCount: insertItemsCount,
        childIndex,
        replacementSourceFile: tempSourceFile,
        replacingNodes: opts.replacing == null ? undefined : opts.replacing.nodes
    });
}
