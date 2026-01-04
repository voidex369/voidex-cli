import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { PendingToolCall } from '../../types/index.js';

interface StatusAreaProps {
  agentStatus: string | null;
  liveToolOutput: string;
  pendingApproval: PendingToolCall | null;
  approvalOptions: { label: string; value: string }[];
  approvalIndex: number;
  userInputCode?: string; // [BARU] Buat nampilin apa yang diketik user pas mode nuclear
}

const StatusArea: React.FC<StatusAreaProps> = ({
  agentStatus,
  liveToolOutput,
  pendingApproval,
  approvalOptions,
  approvalIndex,
  userInputCode = ''
}) => {
  const MAX_LIVE_LINES = 8;
  const cappedOutput = React.useMemo(() => {
    if (!liveToolOutput) return '';
    const lines = liveToolOutput.split('\n').map((l: string) => l.length > 100 ? l.slice(0, 97) + '...' : l);
    if (lines.length > MAX_LIVE_LINES) return '...\n' + lines.slice(-MAX_LIVE_LINES).join('\n');
    return lines.join('\n');
  }, [liveToolOutput]);

  if (!agentStatus && !pendingApproval) return null;

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor={pendingApproval?.riskLevel === 'critical' ? 'red' : 'yellow'} paddingX={1} width="100%">

      {/* 1. STATUS & OUTPUT */}
      {agentStatus && (
        <Box flexDirection="column" width="100%">
          <Box width="100%">
            <Text color="yellow"><Spinner type="dots" /> </Text>
            <Text bold> {agentStatus}</Text>
          </Box>
          {cappedOutput ? <Box marginTop={1} flexDirection="column"><Text color="gray">{cappedOutput}</Text></Box> : null}
        </Box>
      )}

      {/* 2. SECURITY APPROVAL UI */}
      {pendingApproval && (
        <Box flexDirection="column" marginTop={1} width="100%">
          {/* Header Warning */}
          <Text bold color={pendingApproval.riskLevel === 'critical' ? 'red' : 'yellow'}>
            {pendingApproval.riskLevel === 'critical' ? '☢ NUCLEAR THREAT DETECTED' : '⚠ PERMISSION REQUIRED'}
          </Text>

          <Box marginLeft={1} flexDirection="column">
            <Text>Action: <Text bold color="white">{pendingApproval.name}</Text></Text>
            <Text dimColor>{JSON.stringify(pendingApproval.arguments)}</Text>
          </Box>

          {/* CHALLENGE INPUT (Untuk Critical) */}
          {pendingApproval.riskLevel === 'critical' ? (
            <Box marginTop={1} borderStyle="double" borderColor="red" paddingX={1} flexDirection="column">
              <Text bold color="red">DESTRUCTIVE COMMAND!</Text>
              <Text>To confirm, type code: <Text bold inverse>{pendingApproval.challengeCode}</Text></Text>
              <Box marginTop={1}>
                <Text>Input: </Text>
                <Text bold color="cyan">{userInputCode}</Text>
                <Text dimColor>_</Text>
              </Box>
            </Box>
          ) : (
            // Opsi Biasa (Untuk Caution)
            <Box flexDirection="column" marginTop={1} marginLeft={1}>
              {approvalOptions.map((opt, i) => (
                <Text key={opt.value} color={i === approvalIndex ? 'cyan' : 'white'} bold={i === approvalIndex}>
                  {i === approvalIndex ? '●' : ' '} {opt.label}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(StatusArea);