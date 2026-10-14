// Monaco editor bundled locally (no CDN), Java syntax only.
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import Editor, { loader } from '@monaco-editor/react';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

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
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      options={{
        fontSize,
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
