import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Interface for task creation parameters
export interface AddOmniFocusTaskParams {
  name: string;
  note?: string;
  dueDate?: string; // ISO date string
  deferDate?: string; // ISO date string
  flagged?: boolean;
  estimatedMinutes?: number;
  tags?: string[]; // Tag names
  projectName?: string; // Project name to add task to
}

/**
 * Generate pure AppleScript for task creation
 */
function generateAppleScript(params: AddOmniFocusTaskParams): string {
  // Sanitize and prepare parameters for AppleScript
  const name = params.name.replace(/['"\\]/g, '\\$&'); // Escape quotes and backslashes
  const note = params.note?.replace(/['"\\]/g, '\\$&') || '';
  const dueDate = params.dueDate || '';
  const deferDate = params.deferDate || '';
  const flagged = params.flagged === true;
  const estimatedMinutes = params.estimatedMinutes?.toString() || '';
  const tags = params.tags || [];
  const projectName = params.projectName?.replace(/['"\\]/g, '\\$&') || '';
  
  // Construct AppleScript with error handling
  let script = `
  try
    tell application "OmniFocus"
      tell front document
        -- Determine the container (inbox or project)
        if "${projectName}" is "" then
          -- Use inbox of the document
          set newTask to make new inbox task with properties {name:"${name}"}
        else
          -- Use specified project
          try
            set theProject to first flattened project where name = "${projectName}"
            set newTask to make new task with properties {name:"${name}"} at end of tasks of theProject
          on error
            return "{\\\"success\\\":false,\\\"error\\\":\\\"Project not found: ${projectName}\\\"}"
          end try
        end if
        
        -- Set task properties
        ${note ? `set note of newTask to "${note}"` : ''}
        ${dueDate ? `
          set due date of newTask to (current date) + (time to GMT)
          set due date of newTask to date "${dueDate}"` : ''}
        ${deferDate ? `
          set defer date of newTask to (current date) + (time to GMT)
          set defer date of newTask to date "${deferDate}"` : ''}
        ${flagged ? `set flagged of newTask to true` : ''}
        ${estimatedMinutes ? `set estimated minutes of newTask to ${estimatedMinutes}` : ''}
        
        -- Get the task ID
        set taskId to id of newTask as string
        
        -- Add tags if provided
        ${tags.length > 0 ? tags.map(tag => {
          const sanitizedTag = tag.replace(/['"\\]/g, '\\$&');
          return `
          try
            set theTag to first flattened tag where name = "${sanitizedTag}"
            tell newTask to add theTag
          on error
            -- Ignore errors finding/adding tags
          end try`;
        }).join('\n') : ''}
        
        -- Return success with task ID
        return "{\\\"success\\\":true,\\\"taskId\\\":\\"" & taskId & "\\",\\\"name\\\":\\"${name}\\"}"
      end tell
    end tell
  on error errorMessage
    return "{\\\"success\\\":false,\\\"error\\\":\\"" & errorMessage & "\\"}"
  end try
  `;
  
  return script;
}

/**
 * Add a task to OmniFocus
 */
export async function addOmniFocusTask(params: AddOmniFocusTaskParams): Promise<{success: boolean, taskId?: string, error?: string}> {
  try {
    // Generate AppleScript
    const script = generateAppleScript(params);
    
    console.error("Executing AppleScript directly...");
    
    // Execute AppleScript directly
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    
    if (stderr) {
      console.error("AppleScript stderr:", stderr);
    }
    
    console.error("AppleScript stdout:", stdout);
    
    // Parse the result
    try {
      const result = JSON.parse(stdout);
      
      // Return the result
      return {
        success: result.success,
        taskId: result.taskId,
        error: result.error
      };
    } catch (parseError) {
      console.error("Error parsing AppleScript result:", parseError);
      return {
        success: false,
        error: `Failed to parse result: ${stdout}`
      };
    }
  } catch (error: any) {
    console.error("Error in addOmniFocusTask:", error);
    return {
      success: false,
      error: error?.message || "Unknown error in addOmniFocusTask"
    };
  }
} 