local M = {}

--- Show workflow status in a floating window
---@param state table
function M.show_status(state)
  local lines = {
    'RepoFox Status',
    string.rep('-', 30),
    'Status: ' .. state.status,
  }

  if state.last_message then
    table.insert(lines, 'Last commit: ' .. state.last_message)
  end

  if state.last_error then
    table.insert(lines, 'Error: ' .. state.last_error)
  end

  M.show_float(lines, { title = 'RepoFox' })
end

--- Show an approval prompt in a floating window
---@param title string
---@param content string
---@param on_accept fun(edited: string)
---@param on_reject fun()
function M.show_approval(title, content, on_accept, on_reject)
  local lines = vim.split(content, '\n')
  table.insert(lines, 1, '-- ' .. title)
  table.insert(lines, 2, '-- Edit the content below, then :w to accept or :q! to reject')
  table.insert(lines, 3, '')

  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = true
  vim.bo[buf].buftype = 'nofile'
  vim.bo[buf].filetype = 'markdown'

  local width = math.min(80, vim.o.columns - 4)
  local height = math.min(#lines + 2, vim.o.lines - 4)
  local row = math.floor((vim.o.lines - height) / 2)
  local col = math.floor((vim.o.columns - width) / 2)

  local win = vim.api.nvim_open_win(buf, true, {
    relative = 'editor',
    width = width,
    height = height,
    row = row,
    col = col,
    style = 'minimal',
    border = 'rounded',
    title = ' ' .. title .. ' ',
    title_pos = 'center',
  })

  -- Accept: save and close
  vim.keymap.set('n', '<CR>', function()
    local edited_lines = vim.api.nvim_buf_get_lines(buf, 3, -1, false)
    local edited = table.concat(edited_lines, '\n')
    vim.api.nvim_win_close(win, true)
    vim.api.nvim_buf_delete(buf, { force = true })
    on_accept(vim.trim(edited))
  end, { buffer = buf, desc = 'Accept RepoFox suggestion' })

  -- Reject: quit without saving
  vim.keymap.set('n', 'q', function()
    vim.api.nvim_win_close(win, true)
    vim.api.nvim_buf_delete(buf, { force = true })
    on_reject()
  end, { buffer = buf, desc = 'Reject RepoFox suggestion' })
end

--- Show a simple floating window with read-only content
---@param lines string[]
---@param opts? { title?: string }
function M.show_float(lines, opts)
  opts = opts or {}
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  vim.bo[buf].modifiable = false
  vim.bo[buf].buftype = 'nofile'

  local width = 0
  for _, line in ipairs(lines) do
    width = math.max(width, #line)
  end
  width = math.min(width + 4, vim.o.columns - 4)
  local height = math.min(#lines, vim.o.lines - 4)
  local row = math.floor((vim.o.lines - height) / 2)
  local col = math.floor((vim.o.columns - width) / 2)

  local win = vim.api.nvim_open_win(buf, true, {
    relative = 'editor',
    width = width,
    height = height,
    row = row,
    col = col,
    style = 'minimal',
    border = 'rounded',
    title = opts.title and (' ' .. opts.title .. ' ') or nil,
    title_pos = opts.title and 'center' or nil,
  })

  -- Close on q or Escape
  for _, key in ipairs({ 'q', '<Esc>' }) do
    vim.keymap.set('n', key, function()
      vim.api.nvim_win_close(win, true)
      vim.api.nvim_buf_delete(buf, { force = true })
    end, { buffer = buf })
  end
end

return M
