-- RepoFox Neovim plugin auto-load entry
-- Registers user commands when the plugin is loaded

if vim.g.loaded_repofox then
  return
end
vim.g.loaded_repofox = true

require('repofox').setup_commands()
