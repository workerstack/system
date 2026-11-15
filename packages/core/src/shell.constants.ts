/** Windows PowerShell 5.1, the shell PowerShell-only commands and the Windows PATH snapshot run in. */
export const POWERSHELL = "powershell.exe";

/** The zsh binary's name: the one shell whose PATH snapshot is login and interactive. */
export const ZSH = "zsh";

/** The fish binary's name: the one Unix shell with its own rc syntax. */
export const FISH = "fish";

/** The PowerShell module path variable, in any case, which a pwsh 7 parent would point at its own modules. */
export const PS_MODULE_PATH_KEY: RegExp = /^psmodulepath$/i;
