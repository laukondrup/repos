import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { GroupedMenu, type MenuItem } from "../components/GroupedMenu.js";
import { runLabelAdd, runLabelList, runLabelRemove } from "./label.js";

interface LabelMenuAppProps {
  onComplete?: () => void;
}

type LabelAction = "list" | "add" | "remove";
type Phase = "action" | "label" | "targets" | "globs" | "bypassOrg" | "running" | "error";

const actionGroups = [
  {
    category: "label",
    label: "Labels",
    items: [
      { label: "List", value: "list", key: "l", description: "List labels for all tracked repositories" },
      { label: "Add", value: "add", key: "a", description: "Add a label to target repositories" },
      { label: "Remove", value: "remove", key: "r", description: "Remove a label from target repositories" },
    ],
  },
];

function splitArgs(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function LabelMenuApp({ onComplete }: LabelMenuAppProps) {
  const [phase, setPhase] = useState<Phase>("action");
  const [action, setAction] = useState<LabelAction>("list");
  const [label, setLabel] = useState("");
  const [targetsInput, setTargetsInput] = useState("");
  const [globsInput, setGlobsInput] = useState("");
  const [bypassOrgInput, setBypassOrgInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "running") return;

    async function run() {
      try {
        if (action === "list") {
          await runLabelList({ bypassOrg: bypassOrgInput.trim().toLowerCase() === "y" });
        } else if (action === "add") {
          await runLabelAdd(label.trim(), splitArgs(targetsInput), {
            globs: splitArgs(globsInput),
            bypassOrg: bypassOrgInput.trim().toLowerCase() === "y",
          });
        } else {
          await runLabelRemove(label.trim(), splitArgs(targetsInput), {
            globs: splitArgs(globsInput),
            bypassOrg: bypassOrgInput.trim().toLowerCase() === "y",
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
        return;
      }

      if (onComplete) {
        setTimeout(() => onComplete(), 100);
      }
    }

    run();
  }, [action, globsInput, label, onComplete, phase, targetsInput]);

  const onSelectAction = (item: MenuItem) => {
    const nextAction = item.value as LabelAction;
    setAction(nextAction);
    setPhase(nextAction === "list" ? "bypassOrg" : "label");
  };

  if (phase === "action") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">labels</Text>
          <Text dimColor> - Label Commands</Text>
        </Box>
        <GroupedMenu groups={actionGroups} onSelect={onSelectAction} />
      </Box>
    );
  }

  if (phase === "label") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">labels {action}</Text>
        <Box marginTop={1}>
          <Text>Label name:</Text>
        </Box>
        <Box>
          <Text color="cyan">{">"} </Text>
          <TextInput
            value={label}
            onChange={setLabel}
            onSubmit={() => {
              if (label.trim()) {
                setPhase("targets");
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "targets") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">labels {action}</Text>
        <Box marginTop={1}>
          <Text>Targets (repo names/paths, space-separated, optional):</Text>
        </Box>
        <Box>
          <Text color="cyan">{">"} </Text>
          <TextInput
            value={targetsInput}
            onChange={setTargetsInput}
            onSubmit={() => {
              setPhase("globs");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "globs") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">labels {action}</Text>
        <Box marginTop={1}>
          <Text>Globs (space-separated, optional):</Text>
        </Box>
        <Box>
          <Text color="cyan">{">"} </Text>
          <TextInput
            value={globsInput}
            onChange={setGlobsInput}
            onSubmit={() => {
              setPhase("bypassOrg");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "bypassOrg") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">labels {action}</Text>
        <Box marginTop={1}>
          <Text>Bypass org scope? (y/N):</Text>
        </Box>
        <Box>
          <Text color="cyan">{">"} </Text>
          <TextInput
            value={bypassOrgInput}
            onChange={setBypassOrgInput}
            onSubmit={() => {
              setPhase("running");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box padding={1}>
      <Text dimColor>Running label command...</Text>
    </Box>
  );
}
