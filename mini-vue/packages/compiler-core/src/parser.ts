import { NodeTypes } from "./ast";

// 创建 parse 上下文
function createParserContext(content) {
  return {
    originalSource: content,
    source: content, // 字符串会不停的减少(匹配上，处理后就删除匹配到的)
    line: 1,
    column: 1,
    offset: 0,
  };
}

// 判断是否解析完
function isEnd(context) {
  const c = context.source;
  if (c.startsWith("</")) {
    // 如果是闭合标签，也要停止循环
    return true;
  }
  return !c;
}

/**
 * 更新位置信息
 * @param context 上下文
 * @param c 源码字符串
 * @param endIndex 移动的距离
 */
function advancePositionMutation(context, c, endIndex) {
  let linesCount = 0; // 第几行
  let linePos = -1; // 换行的位置信息

  for (let i = 0; i < endIndex; i++) {
    if (c.charCodeAt(i) == 10) {
      linesCount++;
      linePos = i;
    }
  }
  context.offset += endIndex;
  context.line += linesCount;
  context.column =
    linePos == -1 ? context.column + endIndex : endIndex - linePos;
}

/**
 * 删除匹配到的内容，并更新位置信息
 * @param context 上下文
 * @param endIndex 移动的距离
 */
function advanceBy(context, endIndex) {
  let c = context.source;

  // 需要在这里更新位置信息
  advancePositionMutation(context, c, endIndex);

  // 删除匹配到的内容
  context.source = c.slice(endIndex);
}

function parseTextData(context, endIndex) {
  const content = context.source.slice(0, endIndex);
  advanceBy(context, endIndex);
  return content;
}

function getCursor(context) {
  let { line, column, offset } = context;
  return { line, column, offset };
}

// 解析文本
function parseText(context) {
  //
  let tokens = ["<", "{{"]; // 找当前离着最近的词法
  let endIndex = context.source.length; // 先假设找不到
  for (let i = 0; i < tokens.length; i++) {
    const index = context.source.indexOf(tokens[i], 1);
    if (index !== -1 && endIndex > index) {
      endIndex = index;
    }
  }
  let start = getCursor(context);
  let content = parseTextData(context, endIndex); // 这里应该更新位置
  // 0 - endIndex 为文字内容   {{  name }}
  return {
    type: NodeTypes.TEXT,
    content,
    loc: getSelection(context, start),
  };
}

function getSelection(context, start, e?) {
  let end = e || getCursor(context);
  // eslint 可以根据 start，end 找到要报错的位置
  return {
    start,
    end,
    source: context.originalSource.slice(start.offset, end.offset),
  };
}

// 解析插值表达式
function parseInterpolation(context) {
  const start = getCursor(context);
  const closeIndex = context.source.indexOf("}}", 2);
  advanceBy(context, 2); // 去掉开头 {{
  const innerStart = getCursor(context);
  const innerEnd = getCursor(context);
  const preTrimContent = parseTextData(context, closeIndex - 2);
  const content = preTrimContent.trim(); // 表达式中的变量
  // 获取  {{   name   }}去空格
  const startOffset = preTrimContent.indexOf(content);
  if (startOffset > 0) {
    advancePositionMutation(innerStart, preTrimContent, startOffset);
  }
  const endOffset = startOffset + content.length;
  advancePositionMutation(innerEnd, preTrimContent, endOffset);
  advanceBy(context, 2);
  //    name   }}
  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      isStatic: false,
      isConstant: false,
      content,
      loc: getSelection(context, innerStart, innerEnd),
    },
    loc: getSelection(context, start),
  };
}

function advanceSpaces(context) {
  const match = /^[ \t\r\n]+/.exec(context.source);

  if (match) {
    // 删除空格
    advanceBy(context, match[0].length);
  }
}

function parseAttributeValue(context) {
  let quote = context.source[0];

  const isQuoted = quote === '"' || quote === "'";

  let content;
  if (isQuoted) {
    advanceBy(context, 1);
    const endIndex = context.source.indexOf(quote, 1);
    content = parseTextData(context, endIndex); // slice()
    advanceBy(context, 1);
  } else {
    content = context.source.match(/([^ \t\r\n/>])+/)[1]; // 取出内容，删除空格
    advanceBy(context, content.length);
    advanceSpaces(context);
  }
  return content;
}

// 匹配处理标签属性
function parseAttribute(context) {
  const start = getCursor(context);

  // 比如：a="1" B='1'></div>
  let match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
  const name = match[0];
  let value;

  advanceBy(context, name.length);

  // 匹配标签属性中的等号（=）
  // [\t\r\n\f ]*  表示匹配零个或多个空白字符
  if (/^[\t\r\n\f ]*=/.test(context.source)) {
    advanceSpaces(context);
    advanceBy(context, 1);
    advanceSpaces(context);
    value = parseAttributeValue(context);
  }

  // 获取属性位置信息
  let loc = getSelection(context, start);

  return {
    type: NodeTypes.ATTRIBUTE,
    name,
    value: {
      type: NodeTypes.TEXT,
      content: value,
      loc: loc,
    },
    loc: getSelection(context, start),
  };
}

// 匹配处理标签属性
function parseAtrributes(context) {
  const props = [];

  // 当原来是 <div a="1" B='1'></div> 时
  // 经过上一步，得到的 context.source 为 a="1" B='1'></div>
  // 会循环遍历，知道 context.source 还有并且不是 ">" 开头
  while (context.source.length > 0 && !context.source.startsWith(">")) {
    // 不是以 ">" 开头，说明标签上有属性，开始做属性处理
    props.push(parseAttribute(context));

    // 移除空格
    advanceSpaces(context);
  }

  return props;
}

function parseTag(context) {
  const start = getCursor(context);

  // 匹配标签，比如：<div></div> 匹配得到 ['<div', 'div']
  const match = /^<\/?([a-z][^ \t\r\n/>]*)/.exec(context.source);
  const tag = match[1]; // <div   />

  // 删除匹配到的内容
  // 比如：<div></div>，删除匹配到的内容后，context.source 为 '></div>'
  advanceBy(context, match[0].length);

  // 移除空格
  advanceSpaces(context);

  // <div a="1" B='1' >

  // 匹配处理标签属性
  let props = parseAtrributes(context);

  // 判断是否是自闭合标签
  const isSelfClosing = context.source.startsWith("/>");
  // 自闭合标签，那么剩下的是 '/>'，不是自闭合标签，那么剩下的是 '>'
  // 所以自闭合标签，删除两位，不是自闭合标签，删除一位
  advanceBy(context, isSelfClosing ? 2 : 1);

  return {
    type: NodeTypes.ELEMENT,
    tag,
    isSelfClosing,
    loc: getSelection(context, start), // 开头标签解析后的信息
    props,
  };
}

function parseElement(context) {
  // <div >
  const ele = parseTag(context);

  // 递归解析儿子节点,但是解析的时候如果是结尾标签需要跳过
  const children = parseChilren(context);

  if (context.source.startsWith("</")) {
    parseTag(context); //  闭合标签没有意义直接移除即可
  }

  (ele as any).children = children;
  (ele as any).loc = getSelection(context, ele.loc.start);

  return ele;
}

function parseChilren(context) {
  const nodes = [] as any;

  while (!isEnd(context)) {
    const c = context.source; // 现在解析的内容
    let node;
    if (c.startsWith("{{")) {
      // {{}}
      node = parseInterpolation(context);
    } else if (c[0] === "<") {
      // <div>
      node = parseElement(context);
    } else {
      // 文本  // abc  {{}} <div></div>
      node = parseText(context);
    }

    // 状态机
    nodes.push(node);
  }

  // 状态机
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    // 将空节点进行压缩
    if (node.type === NodeTypes.TEXT) {
      // 如果是空白字符 清空
      if (!/[^\t\r\n\f ]/.test(node.content)) {
        nodes[i] = null; // 空白字符清空
      } else {
        node.content = node.content.replace(/[\t\r\n\f ]+/g, " ");
      }
    }
  }

  return nodes.filter(Boolean);
}

function createRoot(children) {
  return {
    type: NodeTypes.ROOT,
    children,
  };
}

function parse(template) {
  // 根据 template 生成 ast

  // 创建 parse 上下文
  const context = createParserContext(template);

  return createRoot(parseChilren(context));
}

export { parse };
