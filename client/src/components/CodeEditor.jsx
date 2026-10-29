// Monaco editor bundled locally (no CDN), Java syntax only.
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import Editor, { loader } from '@monaco-editor/react';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

// Codezis editor theme — matches the portal's ink + Genzis orange palette.
let themeReady = false;
function defineCodezisTheme(m) {
  if (themeReady) return;
  themeReady = true;
  m.editor.defineTheme('codezis', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'E9E3F7' },
      { token: 'comment', foreground: '6E6590', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'B892FF' },
      { token: 'string', foreground: '7EE0A8' },
      { token: 'string.escape', foreground: 'FFB27A' },
      { token: 'number', foreground: 'FFB27A' },
      { token: 'type', foreground: 'F27BBE' },
      { token: 'type.identifier', foreground: 'F27BBE' },
      { token: 'annotation', foreground: 'FF8A4C' },
      { token: 'delimiter', foreground: 'A99FC8' },
      { token: 'operator', foreground: 'FF8A4C' },
    ],
    colors: {
      'editor.background': '#150D24',
      'editor.foreground': '#E9E3F7',
      'editorLineNumber.foreground': '#4F4670',
      'editorLineNumber.activeForeground': '#C9C0E6',
      'editor.lineHighlightBackground': '#1E153380',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#FF6A1F',
      'editor.selectionBackground': '#FF6A1F40',
      'editor.inactiveSelectionBackground': '#FF6A1F22',
      'editor.selectionHighlightBackground': '#9D6BFF22',
      'editorBracketMatch.background': '#9D6BFF33',
      'editorBracketMatch.border': '#9D6BFF88',
      'editorIndentGuide.background1': '#261C3D',
      'editorIndentGuide.activeBackground1': '#42365F',
      'editorWhitespace.foreground': '#2E2448',
      'editorGutter.background': '#150D24',
      'scrollbarSlider.background': '#2B204780',
      'scrollbarSlider.hoverBackground': '#42365F',
      'scrollbarSlider.activeBackground': '#554877',
      'editorWidget.background': '#1A1130',
      'editorWidget.border': '#42365F',
      'editorBracketHighlight.foreground1': '#FF8A4C',
      'editorBracketHighlight.foreground2': '#B892FF',
      'editorBracketHighlight.foreground3': '#F27BBE',
      'editorBracketHighlight.unexpectedBracket.foreground': '#FF5C6C',
    },
  });
  // Re-measure once the bundled mono font has loaded so the cursor lines up.
  document.fonts?.ready?.then(() => m.editor.remeasureFonts()).catch(() => {});
}

/**
 * editorCopyRef receives text the candidate copies/cuts inside the editor,
 * so pasting their own code back is allowed while outside pastes are blocked.
 */
export default function CodeEditor({ value, onChange, editorCopyRef, path, fontSize = 14 }) {
  const onMount = (editor) => {
    const remember = () => {
      const sel = editor.getSelection();
      const model = editor.getModel();
      if (sel && model && !sel.isEmpty()) editorCopyRef.current = model.getValueInRange(sel).replace(/\r\n/g, '\n');
    };
    editor.onKeyDown((e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.keyCode === monaco.KeyCode.KeyC || e.keyCode === monaco.KeyCode.KeyX)) remember();
    });
    editor.focus();
  };

  return (
    <Editor
      path={path}
      language="java"
      theme="codezis"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={defineCodezisTheme}
      onMount={onMount}
      options={{
        fontSize,
        fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
        fontLigatures: false,
        lineHeight: 22,
        padding: { top: 14, bottom: 14 },
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        roundedSelection: true,
        renderLineHighlight: 'all',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        emptySelectionClipboard: false,
        dragAndDrop: false,
        contextmenu: false,
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: 'off',
        parameterHints: { enabled: false },
        renderWhitespace: 'none',
        fixedOverflowWidgets: false,
      }}
    />
  );
}
