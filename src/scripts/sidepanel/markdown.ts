/**
 * 把模型回覆的簡單 Markdown 轉成 HTML（純函式）
 *
 * 模型的輸出不可信：先把整段文字跳脫成純文字，再只把少數幾種標記換成固定的標籤。
 * 支援粗體、行內程式碼、項目清單、編號清單與段落；其他一律當成文字顯示。
 */

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 行內標記：輸入必須是已經跳脫過的文字 */
function inline(escaped: string): string {
    return escaped
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function renderMarkdown(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const html: string[] = [];
    let paragraph: string[] = [];
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

    const flushParagraph = (): void => {
        if (paragraph.length > 0) {
            html.push(`<p>${paragraph.join('<br>')}</p>`);
            paragraph = [];
        }
    };
    const flushList = (): void => {
        if (list) {
            html.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${list.tag}>`);
            list = null;
        }
    };

    for (const line of lines) {
        if (line.trim() === '') {
            flushParagraph();
            flushList();
            continue;
        }

        const bullet = line.match(BULLET);
        const numbered = bullet ? null : line.match(NUMBERED);
        if (bullet || numbered) {
            flushParagraph();
            const tag = bullet ? 'ul' : 'ol';
            if (!list || list.tag !== tag) {
                flushList();
                list = { tag, items: [] };
            }
            list.items.push(inline(escapeHtml((bullet ?? numbered)![1])));
            continue;
        }

        flushList();
        // 要求模型不要用標題，但偶爾還是會出現：當成粗體的一行
        const heading = line.match(HEADING);
        if (heading) {
            flushParagraph();
            html.push(`<p><strong>${inline(escapeHtml(heading[1]))}</strong></p>`);
            continue;
        }
        paragraph.push(inline(escapeHtml(line.trim())));
    }

    flushParagraph();
    flushList();
    return html.join('');
}
