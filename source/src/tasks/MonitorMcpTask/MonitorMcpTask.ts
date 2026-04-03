/**
 * [MOD] MonitorMcpTask — background task for MCP server monitoring.
 *
 * Implements the Task interface for the task framework. Tracks active
 * monitoring sessions and provides cleanup on kill.
 */

import type { Task, SetAppState, TaskStateBase } from '../../Task.js'
import type { AgentId } from '../../types/ids.js'

// ── Task state type ─────────────────────────────────────────────────────

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  serverName: string
  filter?: string
  agentId?: AgentId
  eventCount: number
}

// ── Task implementation ─────────────────────────────────────────────────

export const MonitorMcpTask: Task = {
  name: 'MonitorMcpTask',
  type: 'monitor_mcp',

  async kill(taskId: string, setAppState: SetAppState): Promise<void> {
    setAppState(prev => ({
      ...prev,
      tasks: prev.tasks.map(task =>
        task.id === taskId && task.type === 'monitor_mcp'
          ? { ...task, status: 'killed' as const, endTime: Date.now() }
          : task,
      ),
    }))
  },
}

// ── Helper functions ────────────────────────────────────────────────────

/**
 * Kill all monitor tasks associated with a specific agent.
 * Called when an agent completes/fails to clean up its monitors.
 */
export function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => { tasks: readonly MonitorMcpTaskState[] },
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks
  for (const task of tasks) {
    if (
      task.type === 'monitor_mcp' &&
      (task as MonitorMcpTaskState).agentId === agentId &&
      (task.status === 'running' || task.status === 'pending')
    ) {
      MonitorMcpTask.kill(task.id, setAppState)
    }
  }
}
