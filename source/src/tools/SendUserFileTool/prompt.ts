/**
 * [MOD] SendUserFileTool prompt constants.
 */

export const SEND_USER_FILE_TOOL_NAME = 'SendUserFile'

export const DESCRIPTION = 'Send files to the user'

export const SEND_USER_FILE_TOOL_PROMPT = `Send one or more files to the user. Use this when the user requests a file, or when you've generated output files that need to be delivered.

This tool delivers files through the assistant communication channel. The user will receive a notification with the file(s).

Prefer this over printing file contents to stdout — files may be large and the user's terminal may not support direct display.`
