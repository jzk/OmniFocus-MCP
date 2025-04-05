// OmniJS script to export active tasks from OmniFocus database - Optimized
(() => {
    try {
      const startTime = new Date();
      
      // Helper function to format dates consistently or return null
      function formatDate(date) {
        if (!date) return null;
        return date.toISOString();
      }
  
      // Helper function to safely get enum values - Simplified with direct mapping
      const taskStatusMap = {
        [Task.Status.Available]: "Available",
        [Task.Status.Blocked]: "Blocked",
        [Task.Status.Completed]: "Completed",
        [Task.Status.Dropped]: "Dropped",
        [Task.Status.DueSoon]: "DueSoon",
        [Task.Status.Next]: "Next",
        [Task.Status.Overdue]: "Overdue"
      };
      
      const projectStatusMap = {
        [Project.Status.Active]: "Active",
        [Project.Status.Done]: "Done",
        [Project.Status.Dropped]: "Dropped",
        [Project.Status.OnHold]: "OnHold"
      };
      
      const folderStatusMap = {
        [Folder.Status.Active]: "Active",
        [Folder.Status.Dropped]: "Dropped"
      };
      
      function getEnumValue(enumObj, mapObj) {
        if (enumObj === null || enumObj === undefined) return null;
        return mapObj[enumObj] || "Unknown";
      }
  
      // Create database export object using Maps for faster lookups
      const exportData = {
        exportDate: new Date().toISOString(),
        tasks: [],
        projects: new Map(),
        folders: new Map(),
        tags: new Map()
      };
  
      // Filter active projects first to avoid unnecessary processing
      const activeProjects = flattenedProjects.filter(project => 
        project.status !== Project.Status.Done && 
        project.status !== Project.Status.Dropped
      );
      
      // Pre-filter active tasks to avoid repeated filtering
      const activeTasks = flattenedTasks.filter(task => 
        task.taskStatus !== Task.Status.Completed && 
        task.taskStatus !== Task.Status.Dropped
      );
      
      // Pre-filter active folders
      const activeFolders = flattenedFolders.filter(folder => 
        folder.status !== Folder.Status.Dropped
      );
      
      // Pre-filter active tags
      const activeTags = flattenedTags.filter(tag => tag.active);
      
      // Process projects in a single pass and store in Map for O(1) lookups
      activeProjects.forEach(project => {
        try {
          exportData.projects.set(project.id.primaryKey, {
            id: project.id.primaryKey,
            name: project.name,
            status: getEnumValue(project.status, projectStatusMap),
            folderID: project.parentFolder ? project.parentFolder.id.primaryKey : null,
            sequential: project.task.sequential || false,
            effectiveDueDate: formatDate(project.effectiveDueDate),
            effectiveDeferDate: formatDate(project.effectiveDeferDate),
            dueDate: formatDate(project.dueDate),
            deferDate: formatDate(project.deferDate),
            completedByChildren: project.completedByChildren,
            containsSingletonActions: project.containsSingletonActions,
            note: project.note || "",
            tasks: [] // Will be populated in the task loop
          });
        } catch (projectError) {
          // Silently handle project processing errors
        }
      });
  
      // Process folders in a single pass
      activeFolders.forEach(folder => {
        try {
          exportData.folders.set(folder.id.primaryKey, {
            id: folder.id.primaryKey,
            name: folder.name,
            parentFolderID: folder.parent ? folder.parent.id.primaryKey : null,
            status: getEnumValue(folder.status, folderStatusMap),
            projects: [],
            subfolders: []
          });
        } catch (folderError) {
          // Silently handle folder processing errors
        }
      });
  
      // Process tags in a single pass
      activeTags.forEach(tag => {
        try {
          exportData.tags.set(tag.id.primaryKey, {
            id: tag.id.primaryKey,
            name: tag.name,
            parentTagID: tag.parent ? tag.parent.id.primaryKey : null,
            active: tag.active,
            allowsNextAction: tag.allowsNextAction,
            tasks: []
          });
        } catch (tagError) {
          // Silently handle tag processing errors
        }
      });
  
      console.log("Building relationships and processing tasks simultaneously...");
      
      // Build folder relationships and project-folder relationships as we go
      exportData.folders.forEach((folder, folderId) => {
        if (folder.parentFolderID && exportData.folders.has(folder.parentFolderID)) {
          const parentFolder = exportData.folders.get(folder.parentFolderID);
          if (!parentFolder.subfolders.includes(folder.id)) {
            parentFolder.subfolders.push(folder.id);
          }
        }
      });
  
      console.log(`Processing ${activeTasks.length} active tasks...`);
      
      // Process tasks with an optimized approach
      // Process in batches of 100 to prevent UI freezing
      const BATCH_SIZE = 100;
      
      for (let i = 0; i < activeTasks.length; i += BATCH_SIZE) {
        const taskBatch = activeTasks.slice(i, i + BATCH_SIZE);
        
        taskBatch.forEach(task => {
          try {
            // Get task data with minimal processing
            const taskTags = task.tags.map(tag => tag.id.primaryKey);
            const projectID = task.containingProject ? task.containingProject.id.primaryKey : null;
            
            const taskData = {
              id: task.id.primaryKey,
              name: task.name,
              note: task.note || "",
              taskStatus: getEnumValue(task.taskStatus, taskStatusMap),
              flagged: task.flagged,
              dueDate: formatDate(task.dueDate),
              deferDate: formatDate(task.deferDate),
              effectiveDueDate: formatDate(task.effectiveDueDate),
              effectiveDeferDate: formatDate(task.effectiveDeferDate),
              estimatedMinutes: task.estimatedMinutes,
              completedByChildren: task.completedByChildren,
              sequential: task.sequential || false,
              tags: taskTags,
              projectID: projectID,
              parentTaskID: task.parent ? task.parent.id.primaryKey : null,
              children: task.children.map(child => child.id.primaryKey),
              inInbox: task.inInbox
            };
  
            // Add task to export
            exportData.tasks.push(taskData);
  
            // Add task ID to associated project (if it exists)
            if (projectID && exportData.projects.has(projectID)) {
              exportData.projects.get(projectID).tasks.push(taskData.id);
              
              // Update folder-project relationship (only once per project)
              const project = exportData.projects.get(projectID);
              if (project.folderID && exportData.folders.has(project.folderID)) {
                const folder = exportData.folders.get(project.folderID);
                if (!folder.projects.includes(project.id)) {
                  folder.projects.push(project.id);
                }
              }
            }
  
            // Add task ID to associated tags
            taskTags.forEach(tagID => {
              if (exportData.tags.has(tagID)) {
                exportData.tags.get(tagID).tasks.push(taskData.id);
              }
            });
          } catch (taskError) {
            // Silently handle task processing errors
          }
        });
        
        // Log batch progress
      }
  
      // Convert Maps back to regular objects for JSON output
      const finalExport = {
        exportDate: exportData.exportDate,
        tasks: exportData.tasks,
        projects: Object.fromEntries(exportData.projects),
        folders: Object.fromEntries(exportData.folders),
        tags: Object.fromEntries(exportData.tags)
      };
  
      const endTime = new Date();
      
      // Send the data to our local server using URL.FetchRequest
      try {
        const jsonData = JSON.stringify(finalExport);
        
        // Create a fetch request to send data to our local server
        const request = new URL.FetchRequest();
        
        // Set up the request to POST to our local server
        request.url = URL.fromString("http://localhost:54767/data");
        request.method = "POST";
        request.headers = { "Content-Type": "application/json" };
        request.bodyString = jsonData;
        
        // Make the request
        request.fetch().then(response => {
          // Process response silently
        }).catch(error => {
          // Handle error silently
        });
        
        // Create a simplified export just with the tasks for easier return
        const tasksOnlyExport = {
          exportDate: finalExport.exportDate,
          tasks: finalExport.tasks
        };
        
        // Return a success message with the task count
        return finalExport.tasks
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Error sending data: ${error}`
        });
      }
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: `Error exporting database: ${error}`
      });
    }
  })();