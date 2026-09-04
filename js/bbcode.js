const BBCodeModule = (function () {

  function stripAllBBCode(text) {
    return (text || '').replace(/\[\/?(b|i|color|bg|size)(?:=[^\]]+)?\]/gi, '');
  }

  function parseFormattedTokens(text) {
    const regex = /\[(\/?)(b|i|color|bg|size)(?:=([^\]]+))?\]/gi;
    const stack = [];
    const tokens = [];
    let lastIndex = 0;
    let m;

    function getActiveStyle() {
      const st = {};
      for (const item of stack) {
        if (item.tag === 'b') st.bold = true;
        else if (item.tag === 'i') st.italic = true;
        else if (item.tag === 'color') st.color = item.val;
        else if (item.tag === 'bg') st.bg = item.val;
        else if (item.tag === 'size') st.size = item.val;
      }
      return st;
    }

    while ((m = regex.exec(text)) !== null) {
      const plain = text.slice(lastIndex, m.index);
      if (plain) {
        const currentStyle = getActiveStyle();
        for (const ch of plain) {
          tokens.push({ char: ch, style: currentStyle });
        }
      }
      const isClosing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const val = m[3];

      if (isClosing) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            stack.splice(i, 1);
            break;
          }
        }
      } else {
        stack.push({ tag, val });
      }
      lastIndex = regex.lastIndex;
    }

    const tail = text.slice(lastIndex);
    if (tail) {
      const currentStyle = getActiveStyle();
      for (const ch of tail) {
        tokens.push({ char: ch, style: currentStyle });
      }
    }
    return tokens;
  }

  function tokensToHtml(tokens) {
    if (!tokens || !tokens.length) return '';
    let html = '';

    function isSameStyle(s1, s2) {
      if (!s1 || !s2) return s1 === s2;
      return s1.bold === s2.bold &&
             s1.italic === s2.italic &&
             s1.color === s2.color &&
             s1.bg === s2.bg &&
             s1.size === s2.size;
    }

    function buildStyleAttr(st) {
      if (!st) return '';
      const styles = [];
      if (st.bold) styles.push('font-weight:bold');
      if (st.italic) styles.push('font-style:italic');
      if (st.color) styles.push(`color:${escapeHtml(st.color)}`);
      if (st.bg) styles.push(`background-color:${escapeHtml(st.bg)};border-radius:3px;padding:0 2px`);
      if (st.size) {
        const s = /^\d+$/.test(st.size) ? st.size + 'px' : st.size;
        styles.push(`font-size:${escapeHtml(s)}`);
      }
      return styles.length ? ` style="${styles.join(';')}"` : '';
    }

    let chunkText = '';
    let chunkStyle = null;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (i === 0) {
        chunkText = t.char;
        chunkStyle = t.style;
      } else if (isSameStyle(t.style, chunkStyle)) {
        chunkText += t.char;
      } else {
        const attr = buildStyleAttr(chunkStyle);
        html += attr ? `<span${attr}>${escapeHtml(chunkText)}</span>` : escapeHtml(chunkText);
        chunkText = t.char;
        chunkStyle = t.style;
      }
    }
    if (chunkText) {
      const attr = buildStyleAttr(chunkStyle);
      html += attr ? `<span${attr}>${escapeHtml(chunkText)}</span>` : escapeHtml(chunkText);
    }
    return html;
  }

  return {
    stripAllBBCode,
    parseFormattedTokens,
    tokensToHtml
  };
})();