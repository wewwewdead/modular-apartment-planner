import { DecoratorNode } from "lexical";
import MentionComponent from "./MentionComponent";

export default class MentionNode extends DecoratorNode {
    static getType() {
        return "mention";
    }

    static clone(node) {
        return new MentionNode(
            node.__mentionName,
            node.__mentionUserId,
            node.__mentionUsername,
            node.__key
        );
    }

    constructor(mentionName, mentionUserId, mentionUsername, key) {
        super(key);
        this.__mentionName = mentionName;
        this.__mentionUserId = mentionUserId;
        this.__mentionUsername = mentionUsername;
    }

    isInline() {
        return true;
    }

    createDOM() {
        const span = document.createElement("span");
        span.className = "mention-node";
        return span;
    }

    updateDOM() {
        return false;
    }

    exportJSON() {
        return {
            type: "mention",
            version: 1,
            mentionName: this.__mentionName,
            mentionUserId: this.__mentionUserId,
            mentionUsername: this.__mentionUsername,
        };
    }

    static importJSON(serializedNode) {
        const { mentionName, mentionUserId, mentionUsername } = serializedNode;
        return $createMentionNode(mentionName, mentionUserId, mentionUsername);
    }

    getTextContent() {
        return `@${this.__mentionUsername || this.__mentionName}`;
    }

    decorate(editor) {
        const isEditable = editor.isEditable();
        return (
            <MentionComponent
                mentionName={this.__mentionName}
                mentionUserId={this.__mentionUserId}
                mentionUsername={this.__mentionUsername}
                isEditable={isEditable}
            />
        );
    }
}

export function $createMentionNode(mentionName, mentionUserId, mentionUsername) {
    return new MentionNode(mentionName, mentionUserId, mentionUsername);
}

export function $isMentionNode(node) {
    return node instanceof MentionNode;
}
