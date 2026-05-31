"use client";

import { Icon, Panel, PanelHead, Pill, IC } from "./ui";
import type { TimbreDataset, TimbreTurn } from "./data";
import { datasetSurfaceKey } from "./trace";

type ConversationHistoryProps = {
  conversations: TimbreDataset[];
  selectedKey: string | null;
  liveStatusByKey: Map<string, string>;
  onSelect: (key: string) => void;
  onOpen: (key: string) => void;
};

export function ConversationHistory({
  conversations,
  selectedKey,
  liveStatusByKey,
  onSelect,
  onOpen,
}: ConversationHistoryProps) {
  const selected =
    conversations.find((item) => datasetSurfaceKey(item) === selectedKey) ??
    conversations[0];
  const activeKey = selected ? datasetSurfaceKey(selected) : undefined;

  return (
    <Panel className="tb-history" glow>
      <PanelHead
        icon={<Icon d={IC.history} size={16} />}
        accent="sky"
        title="History"
        sub="all captured caller and agent conversations"
        right={
          <Pill tone="violet">
            {conversations.length} {conversations.length === 1 ? "call" : "calls"}
          </Pill>
        }
      />

      {conversations.length === 0 ? (
        <div className="tb-empty tb-history-empty">
          <Icon d={IC.mic} size={26} />
          <p>No conversations captured yet.</p>
        </div>
      ) : (
        <div className="tb-history-grid">
          <div className="tb-history-list" aria-label="Conversation history">
            {conversations.map((conversation) => {
              const key = datasetSurfaceKey(conversation);
              const status = liveStatusByKey.get(key) ?? "saved";
              const meta = summarizeConversation(conversation);
              const selectedItem = key === activeKey;

              return (
                <button
                  type="button"
                  key={key}
                  className={`tb-history-card ${selectedItem ? "on" : ""}`}
                  onClick={() => onSelect(key)}
                >
                  <span className="tb-history-card-top">
                    <span className="tb-history-title">
                      <Icon d={conversation.source === "agent_sim" ? IC.bot : IC.waveform} size={15} />
                      <span>{sourceLabel(conversation.source)}</span>
                    </span>
                    <span className={`tb-history-status ${statusTone(status)}`}>
                      {statusLabel(status)}
                    </span>
                  </span>
                  <span className="tb-history-id mono">{conversation.callId}</span>
                  <span className="tb-history-meta">
                    {meta.turns} turns / {meta.agentTurns} agent / {meta.callerTurns} caller
                  </span>
                  <span className="tb-history-preview">{meta.preview}</span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="tb-history-detail">
              <div className="tb-history-detail-head">
                <div>
                  <span className="tb-history-kicker mono">
                    {selected.transport} / {selected.scenario}
                  </span>
                  <h3>{selected.callId}</h3>
                </div>
                <button
                  type="button"
                  className="tb-history-open"
                  onClick={() => onOpen(datasetSurfaceKey(selected))}
                >
                  <Icon d={IC.arrowRight} size={14} />
                  Open in Live Call
                </button>
              </div>

              <div className="tb-history-transcript">
                {selected.turns.map((turn) => (
                  <HistoryTurn key={turn.id} turn={turn} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function HistoryTurn({ turn }: { turn: TimbreTurn }) {
  const isAgent = turn.speaker === "agent";

  return (
    <article className={`tb-history-turn ${turn.speaker}`}>
      <div className="tb-history-turn-head">
        <span className="tb-history-speaker">
          <Icon d={isAgent ? IC.bot : IC.user} size={13} />
          {isAgent ? "Agent" : "Caller"}
        </span>
        <span className="tb-history-turn-id mono">{turn.id}</span>
      </div>
      <p>{turn.text}</p>
      {(turn.toolFired || turn.gated || turn.safety) && (
        <div className="tb-history-actions">
          {turn.toolFired && (
            <span className={turn.toolFired.unsafe ? "danger" : "ok"}>
              <Icon d={turn.toolFired.unsafe ? IC.alert : IC.check} size={12} />
              {turn.toolFired.name}
            </span>
          )}
          {turn.gated && (
            <span className="ok">
              <Icon d={IC.shield} size={12} />
              blocked {turn.gated.name}
            </span>
          )}
          {turn.safety && (
            <span className="danger">
              <Icon d={IC.alert} size={12} />
              safety event
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function summarizeConversation(conversation: TimbreDataset) {
  const turns = conversation.turns.length;
  const agentTurns = conversation.turns.filter((turn) => turn.speaker === "agent").length;
  const callerTurns = turns - agentTurns;
  const preview =
    [...conversation.turns].reverse().find((turn) => turn.speaker === "agent")?.text ??
    conversation.turns[conversation.turns.length - 1]?.text ??
    "No transcript text captured.";

  return {
    turns,
    agentTurns,
    callerTurns,
    preview,
  };
}

function sourceLabel(source: string) {
  if (source === "agent_sim") return "Agent";
  if (source === "twilio") return "Twilio";
  if (source === "daily") return "Daily";
  if (source === "cekura") return "Cekura";
  return source;
}

function statusLabel(status: string) {
  if (status === "streaming") return "Live";
  if (status === "completed") return "Done";
  return "Saved";
}

function statusTone(status: string) {
  if (status === "streaming") return "live";
  if (status === "completed") return "done";
  return "saved";
}
