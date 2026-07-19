import { useState } from "react";
import type { OperationRecord } from "@repofox/core";
import { tokens } from "../../tokens.js";

export interface OperationsHistoryProps {
  operations: OperationRecord[];
  pastSessions: PastSession[];
  onRevert: (operationId: string) => void;
  onViewDiff?: (operationId: string) => void;
}

export interface PastSession {
  id: string;
  branchName: string;
  status: "merged" | "closed" | "open";
  completedAt: number;
}

function OperationIcon({
  status,
}: {
  operation: string;
  status: string;
}): JSX.Element {
  const bg =
    status === "done"
      ? tokens.color.status.successBg
      : status === "failed"
        ? "rgba(220, 38, 38, 0.15)"
        : status === "current"
          ? tokens.color.branch.pill
          : tokens.color.bg.elevated;

  return (
    <div
      style={{
        width: "18px",
        height: "18px",
        borderRadius: "4px",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {status === "done" ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke={tokens.color.status.success}
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : status === "failed" ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke={tokens.color.status.error}
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <div
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background:
              status === "current"
                ? tokens.color.branch.pillText
                : tokens.color.text.muted,
          }}
        />
      )}
    </div>
  );
}

export function OperationsHistory({
  operations,
  pastSessions,
  onRevert,
  onViewDiff,
}: OperationsHistoryProps): JSX.Element {
  if (operations.length === 0 && pastSessions.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 12px",
          color: tokens.color.text.muted,
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        No operations yet. Run a workflow to get started.
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 6px" }}>
      {operations.map((operation) => (
        <OperationCard
          key={operation.id}
          operation={operation}
          onRevert={() => onRevert(operation.id)}
          {...(onViewDiff
            ? { onViewDiff: () => onViewDiff(operation.id) }
            : {})}
        />
      ))}

      {pastSessions.length > 0 && (
        <>
          <div
            style={{
              height: "1px",
              background: tokens.color.border.default,
              margin: "6px 0 2px",
            }}
          />
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              color: tokens.color.text.muted,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              padding: "4px 3px 5px",
            }}
          >
            Past sessions
          </div>
          {pastSessions.map((session) => (
            <PastSessionItem key={session.id} session={session} />
          ))}
        </>
      )}
    </div>
  );
}

function OperationCard({
  operation,
  onRevert,
  onViewDiff,
}: {
  operation: OperationRecord;
  onRevert: () => void;
  onViewDiff?: () => void;
}): JSX.Element {
  const [reverting, setReverting] = useState(false);

  const borderColor =
    operation.status === "done"
      ? tokens.color.status.successBg
      : operation.status === "failed"
        ? tokens.color.status.error
        : operation.status === "current"
          ? tokens.color.accent.primary
          : tokens.color.border.default;

  const isPending = operation.status === "pending";

  const handleRevert = (): void => {
    setReverting(true);
    onRevert();
    window.setTimeout(() => setReverting(false), 1800);
  };

  return (
    <div
      style={{
        borderRadius: tokens.radius.card,
        border: `${isPending ? "1px dashed" : "1px solid"} ${borderColor}`,
        marginBottom: "4px",
        overflow: "hidden",
        background: tokens.color.bg.elevated,
        opacity: isPending ? 0.6 : 1,
        transition: "border-color 150ms",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "7px 9px",
        }}
      >
        <OperationIcon
          operation={operation.operation}
          status={operation.status}
        />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: tokens.color.text.primary,
            flex: 1,
          }}
        >
          {operation.label}
        </span>
        {operation.status === "done" && (
          <span
            style={{ fontSize: "11px", color: tokens.color.status.success }}
          >
            ✓
          </span>
        )}
        {isPending && (
          <span
            style={{
              fontSize: "10px",
              color: tokens.color.accent.primary,
              fontWeight: 500,
            }}
          >
            run -&gt;
          </span>
        )}
        <span style={{ fontSize: "10px", color: tokens.color.text.muted }}>
          {formatAge(operation.timestamp)}
        </span>
      </div>

      <div
        style={{
          padding: "0 9px 6px",
          fontSize: "11px",
          color: tokens.color.text.secondary,
        }}
      >
        {operation.detail}
      </div>

      {operation.status === "done" && (
        <div style={{ display: "flex", gap: "4px", padding: "0 9px 7px" }}>
          <ActionButton
            onClick={handleRevert}
            variant="revert"
            label={reverting ? "reverting..." : "<- revert"}
          />
          {onViewDiff && (
            <ActionButton onClick={onViewDiff} variant="default" label="diff" />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  variant,
  label,
}: {
  onClick: () => void;
  variant: "revert" | "default";
  label: string;
}): JSX.Element {
  const [hovered, setHovered] = useState(false);

  const color = variant === "revert" ? "#e57358" : tokens.color.text.secondary;
  const borderColor = variant === "revert" ? "#7a3d2e" : "#444";
  const hoverBg = variant === "revert" ? "#3a1f18" : tokens.color.bg.surface;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: "10px",
        padding: "3px 7px",
        borderRadius: "4px",
        border: `1px solid ${borderColor}`,
        background: hovered ? hoverBg : "transparent",
        color,
        cursor: "pointer",
        transition: "all 120ms",
      }}
    >
      {label}
    </button>
  );
}

function PastSessionItem({ session }: { session: PastSession }): JSX.Element {
  const dotColor =
    session.status === "merged"
      ? tokens.color.status.success
      : tokens.color.text.muted;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        padding: "5px 9px",
        borderRadius: "5px",
        cursor: "pointer",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = tokens.color.bg.elevated;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: "11px",
          color: tokens.color.text.secondary,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {session.branchName}
      </span>
      <span style={{ fontSize: "10px", color: tokens.color.text.muted }}>
        {session.status} · {formatAge(session.completedAt)}
      </span>
    </div>
  );
}

function formatAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
