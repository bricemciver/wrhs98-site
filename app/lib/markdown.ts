/**
 * A deliberately tiny Markdown subset for announcements. All input is
 * HTML-escaped first, so the output is safe to render as HTML.
 * Supports: ## / ### headings, "- " lists, paragraphs, line breaks,
 * **bold**, *italic*, and [links](https://...).
 */
function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string) {
  return escape(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(src: string): string {
  const blocks = src.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      }
      const h = /^(#{2,3}) (.*)$/.exec(block);
      if (h && lines.length === 1) {
        const tag = h[1].length === 2 ? "h2" : "h3";
        return `<${tag}>${inline(h[2])}</${tag}>`;
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

/** Plain-text excerpt for cards. */
export function excerpt(src: string, max = 220): string {
  const text = src
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
