﻿import {AdvancedIterator} from "./../../../utils";
import {Node, BodiedNode} from "./../../../compiler";
import {CompilerFactory} from "./../../../factories";
import {NodeHandler} from "./NodeHandler";
import {StraightReplacementNodeHandler} from "./StraightReplacementNodeHandler";

/**
 * Parent handler used to unwrap the
 */
export class UnwrapParentHandler implements NodeHandler {
    private readonly straightReplacementNodeHandler: StraightReplacementNodeHandler;

    constructor(private readonly compilerFactory: CompilerFactory, private readonly childIndex: number) {
        this.straightReplacementNodeHandler = new StraightReplacementNodeHandler(compilerFactory);
    }

    handleNode(currentNode: Node, newNode: Node) {
        const currentNodeChildren = new AdvancedIterator(currentNode.getChildrenIterator());
        const newNodeChildren = new AdvancedIterator(newNode.getChildrenIterator());
        let index = 0;

        // replace normally until reaching the first child
        while (!currentNodeChildren.done && !newNodeChildren.done && index++ < this.childIndex)
            this.straightReplacementNodeHandler.handleNode(currentNodeChildren.next(), newNodeChildren.next());

        // the child syntax list's children should map to the newNodes next children
        const currentChild = currentNodeChildren.next();
        const childSyntaxList = currentChild.getChildSyntaxListOrThrow();
        for (const child of childSyntaxList.getChildren()) {
            this.straightReplacementNodeHandler.handleNode(child, newNodeChildren.next());
        }

        // destroy all the current child's children except for the children of its child syntax list
        disposeNodes(currentChild);
        function disposeNodes(node: Node) {
            if (node === childSyntaxList) {
                node.disposeOnlyThis();
                return;
            }

            for (const child of node.getChildren())
                disposeNodes(child);

            node.disposeOnlyThis();
        }

        // handle the rest
        while (!currentNodeChildren.done)
            this.straightReplacementNodeHandler.handleNode(currentNodeChildren.next(), newNodeChildren.next());

        // ensure the new children iterator is done too
        if (!newNodeChildren.done)
            throw new Error("Error replacing tree: Should not have more children left over."); // todo: better error message

        this.compilerFactory.replaceCompilerNode(currentNode, newNode.compilerNode);
    }
}
