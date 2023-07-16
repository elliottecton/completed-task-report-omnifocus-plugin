/* global PlugIn Version inbox Alert ApplyResult library Project Form Calendar Pasteboard Tag Project */
(() => {
  const completedReportLib = new PlugIn.Library(new Version('1.0'))

  completedReportLib.functionLibrary = () => {
    const functionLibrary = PlugIn.find('com.KaitlinSalzke.functionLibrary')
    if (functionLibrary !== null) {
      return functionLibrary.library('functionLibrary')
    } else {
      const alert = new Alert(
        'Function Library Required',
        'For this plug-in bundle (Completed Task Report) to work correctly, my Function Library for OmniFocus (https://github.com/ksalzke/function-library-for-omnifocus) is currently also required and needs to be added to the your OmniFocus plug-in folder separately. Either you do not currently have this library file installed, or it is not installed correctly.'
      )
      alert.show()
    }
  }

  completedReportLib.loadSyncedPrefs = () => {
    const syncedPrefsPlugin = PlugIn.find('com.KaitlinSalzke.SyncedPrefLibrary')

    if (syncedPrefsPlugin !== null) {
      const SyncedPref = syncedPrefsPlugin.library('syncedPrefLibrary').SyncedPref
      return new SyncedPref('com.KaitlinSalzke.CompletedTaskReport')
    } else {
      const alert = new Alert(
        'Synced Preferences Library Required',
        'For the Completed Task Report plug-in to work correctly, the \'Synced Preferences for OmniFocus\' plug-in (https://github.com/ksalzke/synced-preferences-for-omnifocus) is also required and needs to be added to the plug-in folder separately. Either you do not currently have this plug-in installed, or it is not installed correctly.'
      )
      alert.show()
    }
  }

  completedReportLib.getExcludedTags = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.read('tagsToExclude') !== null) ? preferences.read('tagsToExclude').map(id => Tag.byIdentifier(id)).filter(tag => tag !== null) : []
  }

  completedReportLib.getExcludedProjects = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.read('projectsToExclude') !== null) ? preferences.read('projectsToExclude').map(id => Project.byIdentifier(id)).map(proj => proj !== null) : []
  }

  completedReportLib.getDayOneJournalName = async () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    const dayOneJournalName = preferences.readString('dayOneJournalName')

    // return name if already set
    if (dayOneJournalName !== null) return dayOneJournalName

    // if not set, prompt user for string, save preference and return name
    const form = new Form()
    form.addField(new Form.Field.String('dayOneJournalName', 'Day One Journal Name', '', null))
    await form.show('Send To Day One', 'OK')
    preferences.write('dayOneJournalName', form.values.dayOneJournalName)
    return form.values.dayOneJournalName
  }

  completedReportLib.getShowTopLevelOnly = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.read('showTopLevelOnly') !== null) ? preferences.readBoolean('showTopLevelOnly') : true
  }

  completedReportLib.getIncludeFolderHeadings = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.read('includeFolderHeadings') !== null) ? preferences.read('includeFolderHeadings') : true
  }

  completedReportLib.getIncludeProjectHeadings = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.read('includeProjectHeadings') !== null) ? preferences.read('includeProjectHeadings') : false
  }

  completedReportLib.getBulletPoint = () => {
    const preferences = completedReportLib.loadSyncedPrefs()
    return (preferences.readString('bulletPoint') !== null) ? preferences.readString('bulletPoint') : ' * '
  }

  completedReportLib.getTasksCompletedBetweenDates = (startDate, endDate) => {
    // function to check if a tag is included in 'excluded tags'
    const isHidden = (element) => {
      return completedReportLib.getExcludedTags().includes(element)
    }

    const showTopLevelOnly = completedReportLib.getShowTopLevelOnly()

    // create an array to store completed tasks
    const tasksCompleted = []

    // function to check if a task was completed today
    const completedToday = (item) => {
      if (
        item.completed &&
        item.completionDate > startDate &&
        item.completionDate < endDate &&
        !item.tags.some(isHidden)
      ) {
        return true
      } else return false
    }

    // get completed tasks from inbox
    inbox.apply((item) => {
      if (completedToday(item)) {
        // if has children, only add if all children excluded due to hidden tags
        if (item.hasChildren && !showTopLevelOnly) {
          if (
            item.children.every((child) => {
              return child.tags.some(isHidden)
            })
          ) {
            tasksCompleted.push(item)
          }
        } else {
          tasksCompleted.push(item)
        }
        // skip children if showTopLevelOnly is set to true in prefs
        if (showTopLevelOnly) {
          return ApplyResult.SkipChildren
        }
      }
    })

    // get other tasks
    library.apply(function (item) {
      if (item instanceof Project && !completedReportLib.getExcludedProjects().includes(item) && item.task.hasChildren) {
        item.task.apply((tsk) => {
          if (completedToday(tsk)) {
            // if has children, only add if all children excluded due to hidden tags
            if (tsk.hasChildren && !showTopLevelOnly) {
              if (
                tsk.children.every((child) => {
                  return child.tags.some(isHidden)
                })
              ) {
                tasksCompleted.push(tsk)
              }
            } else { // add if has no children
              tasksCompleted.push(tsk)
            }
            // skip children if showTopLevelOnly is set to true in prefs
            if (showTopLevelOnly) {
              return ApplyResult.SkipChildren
            }
          }
        })
      }
    })
    return tasksCompleted
  }

  completedReportLib.makeDateHeading = (startDate, endDate) => {
    let headingDates
    if (startDate.toDateString() === endDate.toDateString()) {
      headingDates = 'on ' + startDate.toDateString()
    } else {
      headingDates =
        'from ' + startDate.toDateString() + ' to ' + endDate.toDateString()
    }
    return '# Tasks Completed ' + headingDates + '\n'
  }

  completedReportLib.getMarkdownReport = (heading, tasksCompleted) => {
    let markdown = heading
    let currentFolder = 'No Folder'
    let currentProject = 'No Project'
    let lastTaskName = ''
    let taskNameCounter = 1
    let projectNameCounter = 1
    tasksCompleted.forEach(function (completedTask) {
      // if last instance of same task, show as multiple
      if (completedTask.name !== lastTaskName && taskNameCounter > 1) {
        markdown = markdown.replace(/\n$/g, ' (x' + taskNameCounter + ')\n')
        taskNameCounter = 1
      }
      const containingFolder = completedReportLib
        .functionLibrary()
        .getContainingFolder(completedTask).name
      if (currentFolder !== containingFolder) {
        if (completedReportLib.getIncludeFolderHeadings()) {
          markdown = markdown.concat('\n**', containingFolder.trim(), '**\n')
        }
        currentFolder = containingFolder
      }
      // get current project name - if null (in inbox) use "No Project"
      let taskProject
      let taskNote
      if (completedTask.containingProject == null) {
        taskProject = 'No Project'
      } else {
        taskProject = completedTask.containingProject.name
        taskNote = completedTask.containingProject.note
      }

      // check if project has changed
      if (currentProject !== taskProject) {
        if (completedReportLib.getIncludeProjectHeadings()) {
          if (projectNameCounter > 1) {
            markdown = markdown.replace(
              /\n$/g,
              ' (x' + projectNameCounter + ')\n'
            )
          }
          markdown = markdown.concat('\n_', taskProject.trim(), '_\n')
          markdown = markdown.concat(taskNote, '\n')
        }
        currentProject = taskProject
        projectNameCounter = 1
      } else if (completedTask.name === currentProject) {
        projectNameCounter++
      }
      // include task, unless it's a project and project headings are shown
      if (
        !(completedTask.project !== null && completedReportLib.getIncludeProjectHeadings())
      ) {
        if (completedTask.name !== lastTaskName) {
          markdown = markdown.concat(completedReportLib.getBulletPoint(), completedTask.name, '\n')
        } else {
          taskNameCounter++
        }
        lastTaskName = completedTask.name
      }
    })
    return markdown
  }

  completedReportLib.runReportForPeriod = (startDate, endDate, templateUrl) => {
    console.log('running report for period')
    const tasksCompleted = completedReportLib.getTasksCompletedBetweenDates(
      startDate,
      endDate
    )
    console.log('tasks completed: ' + tasksCompleted)
    const heading = completedReportLib.makeDateHeading(startDate, endDate)
    console.log(heading)

    const markdown = completedReportLib.getMarkdownReport(heading, tasksCompleted)
    console.log(markdown)

    if (templateUrl === 'CLIPBOARD') {
      Pasteboard.general.string = markdown
      new Alert('Done!', 'Completed task report has been copied to the clipboard.').show()
    } else {
      const fullUrl = templateUrl.replace('{{LIST}}', encodeURIComponent(markdown))

      URL.fromString(fullUrl).call(() => {})
    }
  }

  completedReportLib.promptAndRunReport = (templateUrl) => {
    const now = new Date()
    const today = Calendar.current.startOfDay(now)
    const yesterday = completedReportLib
      .functionLibrary()
      .adjustDateByDays(today, -1)

    // basic selection form - select today, tomorrow, or other
    const selectDayForm = new Form()
    const selectDayPopupMenu = new Form.Field.Option(
      'selectedDay',
      'Day',
      ['Today', 'Yesterday', 'Other Day', 'Custom Period'],
      null,
      'Today'
    )
    selectDayForm.addField(selectDayPopupMenu)
    const selectDayFormPrompt = 'Which day?'
    const selectDayFormPromise = selectDayForm.show(selectDayFormPrompt, 'Continue')

    // form for when 'other' is selected - to enter alternative date
    const selectOtherDateForm = new Form()
    const selectOtherDateDateField = new Form.Field.Date('dateInput', 'Date', today)
    selectOtherDateForm.addField(selectOtherDateDateField)
    const selectOtherDateFormPrompt = 'Select date:'

    const selectCustomPeriodForm = new Form()
    const startTimeField = new Form.Field.Date('startTime', 'Start', today)
    const endTimeField = new Form.Field.Date('endTime', 'End', today)
    selectCustomPeriodForm.addField(startTimeField)
    selectCustomPeriodForm.addField(endTimeField)
    const selectCustomPeriodPrompt = 'Select start and end times: '

    // show forms
    selectDayFormPromise.then(function (formObject) {
      const optionSelected = formObject.values.selectedDay
      let startDate
      let endDate
      let selectOtherDateFormPromise
      let day
      let selectCustomPeriodFormPromise
      switch (optionSelected) {
        case 'Today':
          startDate = Calendar.current.startOfDay(today)
          endDate = new Date(today.setHours(23, 59, 59, 999))
          completedReportLib.runReportForPeriod(
            startDate,
            endDate,
            templateUrl
          )
          break
        case 'Yesterday':
          startDate = Calendar.current.startOfDay(yesterday)
          endDate = new Date(yesterday.setHours(23, 59, 59, 999))
          completedReportLib.runReportForPeriod(
            startDate,
            endDate,
            templateUrl
          )
          break
        case 'Other Day':
          selectOtherDateFormPromise = selectOtherDateForm.show(
            selectOtherDateFormPrompt,
            'Continue'
          )
          selectOtherDateFormPromise.then(function (formObject) {
            day = formObject.values.dateInput
            startDate = Calendar.current.startOfDay(day)
            endDate = new Date(day.setHours(23, 59, 59, 999))
            completedReportLib.runReportForPeriod(
              startDate,
              endDate,
              templateUrl
            )
          })
          selectOtherDateFormPromise.catch(function (err) {
            console.log('form cancelled', err.message)
          })
          break
        case 'Custom Period':
          selectCustomPeriodFormPromise = selectCustomPeriodForm.show(
            selectCustomPeriodPrompt,
            'Continue'
          )
          selectCustomPeriodFormPromise.then(function (formObject) {
            startDate = formObject.values.startTime
            endDate = formObject.values.endTime
            completedReportLib.runReportForPeriod(
              startDate,
              endDate,
              templateUrl
            )
          })
          selectCustomPeriodFormPromise.catch(function (err) {
            console.log('form cancelled', err.message)
          })
          break
        default:
      }
    })

    selectDayFormPromise.catch(function (err) {
      console.log('form cancelled', err.message)
    })
  }

  return completedReportLib
})()
