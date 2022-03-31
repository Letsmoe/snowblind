import { Snowblind } from "./snowblind.js";
import { ValueBinder, NodeInsertAfter, exposedComponents, } from "./shared-internals.js";
const getAttributes = (node) => {
    return Array.from(node.attributes)
        .map((a) => [a.name, a.value])
        .reduce((acc, attr) => {
        acc[attr[0]] = attr[1];
        return acc;
    }, {});
};
const MATCH_INDEX = /\{\{([0-9]+)\}\}/g;
const isStringArray = (arr) => arr.map((x) => typeof x === "string").indexOf(false) === -1;
const findIndex = (str) => str.matchAll(MATCH_INDEX);
class SnowblindElement {
    constructor(node, values, walker) {
        this.attributes = getAttributes(node);
        this.node = node;
        this.values = values;
        let nodeName = this.node.nodeName.toLowerCase();
        const stopOverwrite = exposedComponents.hasOwnProperty(nodeName);
        for (const key in this.attributes) {
            let indexString = this.attributes[key];
            let indices = Array.from(findIndex(indexString));
            let arrValues = indices.map((index) => {
                return values[parseInt(index[1])];
            });
            let subName = key.substring(1);
            let value;
            let dontRemove = false;
            if (isStringArray(arrValues)) {
                value = indexString.replace(MATCH_INDEX, (full, index) => {
                    index = parseInt(index);
                    return values[index];
                });
            }
            else {
                value = arrValues[arrValues.length - 1];
            }
            this.attributes[key] = value;
            if (stopOverwrite === false) {
                if (key === "ref") {
                    value.current = this.node;
                    this.node.isReferenceTo = value;
                    this.node.removeAttribute("ref");
                }
                if (key.startsWith("@")) {
                    if (key[1] === "@") {
                        this.setEvent(subName.substring(1), value, true);
                    }
                    else {
                        this.setEvent(subName, value, false);
                    }
                }
                else if (key.startsWith(".")) {
                    this.setProperties(subName, value);
                }
                else if (key.startsWith("?")) {
                    this.setConditionally(subName, value);
                }
                else if (key.startsWith("!")) {
                    this.setObject(value);
                }
                else {
                    this.trySetAttribute(key, value);
                    dontRemove = true;
                }
                if (!dontRemove) {
                    this.node.removeAttribute(key);
                }
            }
        }
        if (stopOverwrite === true) {
            scanElement(this.node, this.values);
            if (walker) {
                walker.previousSibling();
            }
            let component = new Snowblind.Component(this.attributes, exposedComponents[nodeName], {
                hasTheme: false,
                replace: this.node,
            });
            this.node = component.Node;
            this.createdNewComponent = true;
        }
    }
    trySetAttribute(key, value) {
        try {
            this.node.setAttribute(key, value);
        }
        catch (e) {
            console.error(`'${key}' is not a valid attribute name.`);
        }
    }
    setObject(object) {
        for (const key in object) {
            let value = object[key];
            this.trySetAttribute(key, value);
        }
    }
    setConditionally(property, value) {
        if (value) {
            this.node[property] = value;
        }
    }
    setProperties(property, props) {
        this.node[property] = props;
    }
    setEvent(event, callback, onlyThisNode = false) {
        this.node.addEventListener(event, (e) => {
            if (onlyThisNode &&
                e.target.isEqualNode(this.node)) {
                callback(this.node, e);
            }
            else if (!onlyThisNode) {
                callback(this.node, e);
            }
        });
    }
}
function scanElement(node, arrValues) {
    var walker = document.createTreeWalker(node, 1, null);
    let current;
    while ((current = walker.nextNode())) {
        current = new SnowblindElement(current, arrValues, walker).node;
    }
}
function isInstance(el, type, mode = "or") {
    type = [type].flat(1);
    let map = type.map((x) => el instanceof x);
    return (mode == "or" ? map.indexOf(true) > -1 : map.indexOf(false) == -1);
}
function insertText(elem, text) {
    var textElement = document.createTextNode(text);
    elem.appendChild(textElement);
    return textElement;
}
function html(strings, ...vars) {
    var result = "", i = 0;
    for (const str of strings) {
        result +=
            str + (strings[strings.length - 1] === str ? "" : `{{${i++}}}`);
    }
    const template = document.createElement("template");
    result = result.replace(/<([A-z0-9]+)(.*?)\/>(?: |$|<[A-z]|\n)/g, "<$1 $2></$1>");
    template.innerHTML = result;
    if (template.content.children.length > 1) {
        throw new Error("Multiple elements must be wrapped in a single element.");
    }
    var walker = document.createTreeWalker(template.content, 1, null);
    let node;
    let foundInputs = 0;
    while ((node = walker.nextNode()) !== null) {
        const element = new SnowblindElement(node, vars, walker);
        node = element.node;
        if (isInstance(node, [HTMLTextAreaElement, HTMLInputElement])) {
            if (!node.hasAttribute("key")) {
                node.setAttribute("key", "input-" + foundInputs);
                foundInputs++;
            }
        }
        var lastItem;
        var childNodes = Array.from(node.childNodes);
        for (const children of childNodes) {
            if (children.nodeType === Node.TEXT_NODE) {
                var innerText = children.textContent;
                const matchArray = Array.from(innerText.matchAll(MATCH_INDEX));
                innerText = innerText.replace(MATCH_INDEX, (i) => {
                    return " ".repeat(i.length);
                });
                if (matchArray.length > 0) {
                    children.textContent = "";
                }
                var lastOffsetIndex = 0;
                for (let i = 0; i < matchArray.length; i++) {
                    const match = matchArray[i];
                    var index = parseInt(match[1]);
                    var value = vars[index];
                    var insertBefore = innerText.substring(lastOffsetIndex, match.index);
                    if (insertBefore !== "") {
                        lastItem = insertText(node, insertBefore);
                    }
                    const appendItem = (value) => {
                        if (isInstance(value, [HTMLElement, SVGElement, Text])) {
                            NodeInsertAfter(value, lastItem);
                            lastItem = value;
                        }
                        else if (Array.isArray(value)) {
                            value
                                .slice()
                                .map((x) => appendItem(x));
                        }
                        else {
                            if (value !== Object(value) ||
                                isInstance(value, ValueBinder)) {
                                lastItem = insertText(node, value);
                            }
                            else {
                                console.error("Only instances of HTMLElement, SVGElement, Text or Array are supported.");
                            }
                        }
                    };
                    appendItem(value);
                    if (i == matchArray.length - 1) {
                        children.remove();
                        var insertAfter = innerText.substring(match.index + match[0].length);
                        if (insertAfter != "") {
                            insertText(node, insertAfter);
                        }
                    }
                    lastOffsetIndex = match.index + value && value.length;
                }
            }
        }
    }
    const child = template.content.children[0];
    Snowblind.renderAllIn(child);
    return child;
}
export { html };
//# sourceMappingURL=html.js.map