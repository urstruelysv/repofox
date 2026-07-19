local M = {}
local run_cli

--- Internal state
local state = {
  status = 'idle', -- idle | running | complete | error
  last_message = nil,
  last_error = nil,
}

---@return table
function M.get_state()
  return vim.deepcopy(state)
end

---@param config table
---@param action string
---@param label string
local function run_workflow(config, action, label)
  if state.status == 'running' then
    vim.notify('RepoFox: workflow already running', vim.log.levels.WARN)
    return
  end

  state.status = 'running'
  state.last_error = nil
  vim.notify('RepoFox: running ' .. label .. '...', vim.log.levels.INFO)

  run_cli(config, { 'run', '--action', action, '--provider', config.provider, '--yes' }, function(code, stdout, stderr)
    if code ~= 0 then
      state.status = 'error'
      state.last_error = stderr ~= '' and stderr or 'CLI exited with code ' .. code
      vim.notify('RepoFox: ' .. state.last_error, vim.log.levels.ERROR)
      return
    end

    state.status = 'complete'
    state.last_message = stdout ~= '' and stdout or label .. ' complete'
    vim.notify('RepoFox: ' .. label .. ' complete', vim.log.levels.INFO)
  end)
end

--- Resolve the CLI binary path
---@param config table
---@return string
local function cli_bin(config)
  return config.cli_path or 'repofox'
end

--- Run the CLI and capture output
---@param config table
---@param args string[]
---@param on_done fun(code: number, stdout: string, stderr: string)
run_cli = function(config, args, on_done)
  local bin = cli_bin(config)
  local cmd = vim.list_extend({ bin }, args)

  local stdout_chunks = {}
  local stderr_chunks = {}

  vim.fn.jobstart(cmd, {
    stdout_buffered = true,
    stderr_buffered = true,
    on_stdout = function(_, data)
      if data then
        vim.list_extend(stdout_chunks, data)
      end
    end,
    on_stderr = function(_, data)
      if data then
        vim.list_extend(stderr_chunks, data)
      end
    end,
    on_exit = function(_, code)
      local stdout = table.concat(stdout_chunks, '\n')
      local stderr = table.concat(stderr_chunks, '\n')
      vim.schedule(function()
        on_done(code, stdout, stderr)
      end)
    end,
  })
end

--- Run the shared RepoFox CLI commit action
---@param config table
function M.commit(config)
  run_workflow(config, 'commit', 'commit workflow')
end

--- Push current branch to origin
---@param config table
function M.push(config)
  run_workflow(config, 'push', 'push workflow')
end

--- Full workflow: commit then push
---@param config table
function M.full(config)
  run_workflow(config, 'commit_push_pr', 'full workflow')
end

return M
