import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputAreaProps {
  input: string;
  setInput: (val: string) => void;
  onSubmit: (val: string) => void;
  suggestions: any[];
  selectedIndex: number;
  hasMemory: boolean;
  isLoading: boolean;
  resetKey?: number; // [BARU] Sinyal buat reset kursor
}

const InputArea: React.FC<InputAreaProps> = ({
  input,
  setInput,
  onSubmit,
  suggestions,
  selectedIndex,
  hasMemory,
  isLoading,
  resetKey = 0 // [BARU] Default 0
}) => {
  return (
    <Box flexDirection="column" width="100%">

      {/* 1. COMMAND SUGGESTIONS POPUP */}
      {suggestions.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={1} width="100%">
          {suggestions.map((s, i) => (
            <Box key={s.cmd} flexDirection="row" width="100%">
              <Text color={i === selectedIndex ? 'cyan' : 'white'} bold={i === selectedIndex}>
                {i === selectedIndex ? '> ' : '  '}{s.cmd}
              </Text>
              <Text dimColor> - {s.desc}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 2. MAIN INPUT BOX */}
      <Box borderStyle="single" borderColor={isLoading ? 'gray' : 'green'} paddingX={1} flexDirection="column" width="100%">
        <Box flexDirection="row" width="100%">
          <Box marginRight={1}>
            <Text bold color={isLoading ? 'gray' : 'green'}>❯</Text>
          </Box>
          <Box flexGrow={1} minHeight={1}>
            {isLoading ? (
              <Text color="gray">System locked...</Text>
            ) : (
              <TextInput
                key={resetKey} // [BARU] Ini triknya! Kalau angka ini berubah, input di-reset & kursor ke ujung.
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                placeholder="Type or / for commands..."
              />
            )}
          </Box>
        </Box>

        {/* 3. MEMORY INDICATOR */}
        {hasMemory && (
          <Box marginTop={1} width="100%">
            <Text dimColor italic>└─ Sovereign memory active</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(InputArea);