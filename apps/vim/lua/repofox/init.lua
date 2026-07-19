local workflow = require('repofox.workflow')
local ui = require('repofox.ui')

local M = {}

--- Default configuration
M.config = {
  -- Path to the repofox binary. If nil, searches $PATH.
  cli_path = nil,
  -- AI provider: "groq", "openai", or "anthropic"
  provider = 'groq',
  -- Auto-push after commit
  auto_push = false,
  -- Show floating window for approval prompts
  floating_approval = true,
}

--- Merge user config with defaults
---@param opts table|nil
function M.setup(opts)
  M.config = vim.tbl_deep_extend('force', M.config, opts or {})
end

--- Register all user commands
function M.setup_commands()
  vim.api.nvim_create_user_command('RepoFoxCommit', function()
    workflow.commit(M.config)
  end, { desc = 'RepoFox: Generate AI commit message, stage, and commit' })

  vim.api.nvim_create_user_command('RepoFoxPush', function()
    workflow.push(M.config)
  end, { desc = 'RepoFox: Push current branch to origin' })

  vim.api.nvim_create_user_command('RepoFoxPR', function()
    workflow.full(M.config)
  end, { desc = 'RepoFox: Full branch -> commit -> push workflow' })

  vim.api.nvim_create_user_command('RepoFoxStatus', function()
    ui.show_status(workflow.get_state())
  end, { desc = 'RepoFox: Show current workflow status' })
end

--- Statusline component — call from your statusline config
--- Returns a short string like "🦊 running" or "" when idle
---@return string
function M.statusline()
  local state = workflow.get_state()
  if state.status == 'idle' then
    return ''
  end
  local icons = {
    running = 'RepoFox: running',
    complete = 'RepoFox: done',
    error = 'RepoFox: error',
  }
  return icons[state.status] or ''
end

return M
