﻿import * as ts from "typescript";
import * as errors from "./../errors";
import {Node} from "./../compiler";

export function getRangeFromArray<T extends Node>(array: Node[], index: number, length: number, expectedKind: ts.SyntaxKind) {
    const children = array.slice(index, index + length);

    if (children.length !== length)
        throw new errors.NotImplementedError(`Unexpected! Inserted ${length} child/children, but ${children.length} were inserted.`);
    for (const child of children) {
        if (child.getKind() !== expectedKind)
            throw new errors.NotImplementedError(`Unexpected! Inserting syntax kind of ${ts.SyntaxKind[expectedKind]}` +
                `, but ${child.getKindName()} was inserted.`);
    }

    return children as T[];
}
