---
title: Azure Web Apps Continuous Deployment
date: 2015-10-05 15:46:34
permalink: azure-web-apps-continuous-deployment
excerpt: Azure Web Apps provide a continuous deployment feature that allows you to quickly set up a continuous build and deployment process from your code repository. It implements a pull model when your repository is cloned to your web app, changes are pulled and the application is built when...
uuid: 09d165c9-1a9b-4d5e-8056-4e46ffcd5db5
tags: Azure App Services, Azure Services
---

Azure Web Apps provide a continuous deployment feature that allows you to quickly set up a continuous build and deployment process from your code repository.

It implements a pull model when your repository is cloned to your web app, changes are pulled and the application is built when the web app gets notified from your source code hosting service and then deployed artifacts get copied to wwwroot folder. This is different from a more traditional model where you set up a build server that takes care of pulling sources, building them and preparing a deployment package that gets uploaded to the hosting environment.

The pull model is simpler as you get continuous deployment right from your code repository without having to worry setting up a separate build server somewhere. It works because build and other tools are preinstalled on VMs running web apps. The infrastructure that powers you web apps including the continuous deployment process is called Kudu. In some cases the process works seamlessly as it supports different types of apps and stacks. But often you need to tweak things here and there and thus you need to have a general understanding of how the process works.

## Setup

Once you create a web app you navigate to its Setting blade and locate the Continuous Deployment option. You have a bunch of supported source options from local GIT repo to hosted GIT or Mercurial repos. You can also pull from OneDrive and Dropbox folders so you can implement a hybrid model where you build and prepare packages and put them on OneDrive or Dropbox and then have Azure pull those packages and extract them into wwwroot. Check out [this post](https://alexandrebrisebois.wordpress.com/2015/09/15/azure-adventures-deploying-a-jsp-web-app-to-azure-app-service/) on how you could deploy a Java based web application from DropBox using a pre-built WAR file.

![Azure App Services Continuous Deployment - Source Selection](https://blogcontent.azureedge.net/43eddbfe-fd3d-4462-85a8-b8f4ea2025f9.png)

For now let’s pick Bitbucket and set up a repository and branch that we want to pull source code from. Azure will set up a clone repository in your web app that you can check out either through Kudu console or by connecting to your web app over FTP and navigating to %home%/site/repository:

![Repository folder](https://blogcontent.azureedge.net/2a20ee6f-ec2d-443c-a8d7-0c9ebe4c4de6.png)

Once cloned the initial deployment will be triggered. Subsequent deployments will be triggered when new commits are added to the branch that you specified when you paired with web app with a repository. The notification mechanism may vary. For example, as of time of this writing integration with Bitbucket is implemented through its [POST services](https://confluence.atlassian.com/bitbucket/manage-bitbucket-cloud-services-221449732.html) but in the future it will be transformed to [Web Hooks](https://confluence.atlassian.com/bitbucket/manage-webhooks-735643732.html).

Deployment logs and auto generated scripts can be found in %home%/site/deployments folder. Deployment log will usually contain messages about generating the deployment script or executing a custom one for your repo, output of the deployment script and KuduSync process.

![Deployment log](https://blogcontent.azureedge.net/c632c89c-2db7-46fd-91fb-2819d49fb3df.png)

## Deployment script

If no custom build and deployment script is provided Kudu takes care of generating one automatically based on the type of application that it detects from your code repo. Generation is done with Azure cross platform CLI tool ([azure-xplat-cli](https://github.com/Azure/azure-xplat-cli)). From the log file shown above you can see that Kudu detected an ASP.NET web application and ran the following command to generate the script:

```
azure -y --no-dot-deployment -r "D:\home\site\repository" -o "D:\home\site\deployments\tools" 
    --aspWAP "D:\home\site\repository\TestWebApp\TestWebApp.csproj" 
    --solutionFile "D:\home\site\repository\TestWebApp.sln"

```

Azure CLI supports ASP.NET application and web site projects, ASP.NET 5 projects, Node, Python and PHP applications as well as .NET console applications which can be used to create web jobs.

The generated deployment script can be found in %home%/site/deployments/tools folder together with a cache key file containing the command that was used to generate the script. As I mentioned earlier in some cases the generated script will be sufficient but often you may need to provide your own.

To make Kudu use your custom deployment script you need to add a file called .deployment to the root of your repo containing a line that specified what script to run:

```
[config]
command = deploy.cmd

```

This instructs Kudu to skip generation of the deployment script and run deploy.cmd that is also located in the root of the repository.

## ASP.NET web application projects

You get a pretty good support out of the box for this type projects. If you look at the generated script you will see 3 distinct actions:

1.  Restore NuGet packages for the solution
2.  Run MSBuild to build and package the application in a temporary folder
3.  Run KuduSync to move the package to wwwroot

```
:: Deployment
:: ----------

echo Handling .NET Web Application deployment.

:: 1\. Restore NuGet packages
IF /I "WebApplication2.sln" NEQ "" (
  call :ExecuteCmd nuget restore "%DEPLOYMENT_SOURCE%\WebApplication2.sln"
  IF !ERRORLEVEL! NEQ 0 goto error
)

:: 2\. Build to the temporary path
IF /I "%IN_PLACE_DEPLOYMENT%" NEQ "1" (
  call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\WebApplication\WebApplication2.csproj" /nologo /verbosity:m 
    /t:Build /t:pipelinePreDeployCopyAllFilesToOneFolder 
    /p:_PackageTempDir="%DEPLOYMENT_TEMP%";AutoParameterizationWebConfigConnectionStrings=false;Configuration=Release 
    /p:SolutionDir="%DEPLOYMENT_SOURCE%\.\\" %SCM_BUILD_ARGS%
) ELSE (
  call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\WebApplication\WebApplication2.csproj" /nologo /verbosity:m 
    /t:Build /p:AutoParameterizationWebConfigConnectionStrings=false;Configuration=Release 
    /p:SolutionDir="%DEPLOYMENT_SOURCE%\.\\" %SCM_BUILD_ARGS%
)

IF !ERRORLEVEL! NEQ 0 goto error

:: 3\. KuduSync
IF /I "%IN_PLACE_DEPLOYMENT%" NEQ "1" (
  call :ExecuteCmd "%KUDU_SYNC_CMD%" -v 50 -f "%DEPLOYMENT_TEMP%" -t "%DEPLOYMENT_TARGET%" 
    -n "%NEXT_MANIFEST_PATH%" -p "%PREVIOUS_MANIFEST_PATH%" -i ".git;.hg;.deployment;deploy.cmd"
  IF !ERRORLEVEL! NEQ 0 goto error
)

```

In-place deployment is not used by default for this type of project so the application is built and packaged to %DEPLOYMENT_TEMP% directory.

## KuduSync

What’s KuduSync? This is a Node tool that syncs files between directories. It was created specifically to cover the needs of app services (originally web sites) but in fact it can be used anywhere. To install it run the following command (given that Node is already present on your machine):

```
npm install kudusync -g

```

When run with the –g flag node packages and apps get installed “globally” in your user’s profile. On Windows they get installed to c:\Users\{userName}\AppData\Roaming\npm\ directory. Then you can run KuduSync with a command similar to the one from the deployment script:

```
kudusync -f "d:\dev\temp\WebApplication2" -t "d:\dev\temp\target" -n "d:\dev\temp\manifest.txt"

```

This command copies all files and directories from d:\dev\temp\WebApplication2 folder to d:\dev\temp\target folder. The deployment script shown above copies build artifacts from a temporary folder (%DEPLOYMENT_TEMP%) to wwwroot (%DEPLOYMENT_TARGET%).

Notice the –n required parameter that specifies a new manifest file name. Manifest is a text file listing all of the files with their paths that have been copied during the current run. Now if you look at the deployment script there is also an optional –p parameter that specifies a path to a previous manifest file. With the previous manifest (or snapshot) file KuduSync is able to detect what files need to be removed from the target directory. KuduSync also compares existing files and copies also modified and new ones. Manifest files of actual deployments can be found in %home%/site/deployments/{deploymentId} folders together with deployment logs.

There is also an optional –i parameter that allows you to specify files that should be ignored from the sync.

## What about web jobs?

Let’s say we want to add a .NET console app as a web job and we want it to be built and moved to an appropriate directory under App_Data depending on its type. Using Visual Studio we can associate the web job project with the web application by right-clicking on the web application project and selecting “Add/Existing project as Azure WebJob” command. VS tools install Microsoft.Web.WebJobs.Publish package both to the web application as well as to the selected web job project. They also add webjobs-list.json file referencing the web job project to the web project and webjob-publish-settings.json file describing the job type and schedule to the web job console project. These files are important for MSBuild targets from Microsoft.Web.WebJobs.Publish package that get added to your project files.

These steps alone are enough for the web application project type to be built and packaged correctly. As a result of running MSBuild your OnDemand and Scheduled web jobs are placed in App_Data/jobs/triggered folder and continuous web jobs are placed in App_Data/jobs/continuous folder.

However, if your web jobs are supposed to run on schedule there is a problem. When deployed from Visual Studio schedules for these jobs are created in Azure scheduler service for you. When deployed from a build machine you need to write a script to do the same and the script needs to execute within your subscription security context.

Azure team realized the difficulties it had with the continuous deployment process and built another scheduling mechanism in Kudu. The mechanism is based on [cron expressions](https://code.google.com/p/ncrontab/wiki/CrontabExpression) and it makes it as easy to define a schedule for your jobs as adding a settings.job file with an appropriate cron expression to the web job project and setting the build action to copy the file to the output folder. Kudu uses [NCrontab](https://www.nuget.org/packages/ncrontab/) package that supports 6 part expressions (seconds, minutes, hours, days, months and days of week). You can find more details about the cron expressions support in web jobs in [Amit Apple's blog post](http://www.amitapple.com/post/2015/06/scheduling-azure-webjobs/#.Vg-uGTahdPb).

## ASP.NET web site projects

This type of ASP.NET project has been around for a while and although the web application project type has gained a lot more popularity especially since the inception of MVC web sites are still used and of course supported by Azure web apps. Even this blog currently runs on a customized version of [MiniBlog](https://github.com/dzimchuk/MiniBlog) which is essentially an ASP.NET Web Pages application.

Anyway, let's have a look at the deployment script that Azure CLI produces for this type of project:

```
:: Deployment
:: ----------

echo Handling .NET Web Site deployment.

:: 1\. Build to the repository path
call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\Solution1.sln" /verbosity:m /nologo %SCM_BUILD_ARGS%
IF !ERRORLEVEL! NEQ 0 goto error

:: 2\. KuduSync
IF /I "%IN_PLACE_DEPLOYMENT%" NEQ "1" (
  call :ExecuteCmd "%KUDU_SYNC_CMD%" -v 50 -f "%DEPLOYMENT_SOURCE%\TestWebSite" -t "%DEPLOYMENT_TARGET%" 
    -n "%NEXT_MANIFEST_PATH%" -p "%PREVIOUS_MANIFEST_PATH%" -i ".git;.hg;.deployment;deploy.cmd"
  IF !ERRORLEVEL! NEQ 0 goto error
)

```

There are just 2 steps:

1.  MSBuild of the solution
2.  KuduSync from the repository folder to wwwroot

This will be enough in simple cases when you don’t need NuGet package restore and you don’t need to deploy web jobs.

But let’s say we have a solution with an ASP.NET web site project, some class library projects that are referenced by the web site project and a console project for a web job.

The web job project is not referenced by a web site project as it was the case with ASP.NET web application project type. However, there is no way to associate the web job project with the web site. The mechanism based on webjobs-list.json doesn’t seem to work here.

Here’s what you need to do. First, install Microsoft.Web.WebJobs.Publish package to the web job project. The package will add the necessary build targets and webjob-publish-settings.json file. In Visual Studio it can be easily done by right-clicking on the web job project and selecting “Publish as Azure WebJob” command. Fill out details on the presented form (web job type) but do not actually publish the project. As a result you will have webjob-publish-settings.json file added to your project.

Then you need a custom deployment script. On your development machine install Azure CLI:

```
npm install -g azure-cli

```

And generate the default script for ASP.NET web site project type. Let’s say your current directory is your solution directory and your web site project is called TestWebSite and your solution is called Solution1:

```
azure site deploymentscript --aspWebSite --sitePath TestWebSite --solutionFile Solution1.sln

```

This will create both deploy.cmd and .deployment files in your solution folder. These files need to be committed to source control and they will be used by Kudu instead of automatically generated script.

The generated deploy.cmd gives you a basic structure and ceremony code but you need to update the Deployment part as follows:

```
:: Deployment
:: ----------

echo Handling .NET Web Site deployment.

IF /I "Solution1.sln" NEQ "" (
  call :ExecuteCmd nuget restore "%DEPLOYMENT_SOURCE%\Solution1.sln"
  IF !ERRORLEVEL! NEQ 0 goto error

  call :ExecuteCmd nuget restore "%DEPLOYMENT_SOURCE%\TestWebSite\packages.config" -SolutionDirectory "%DEPLOYMENT_SOURCE%"
  IF !ERRORLEVEL! NEQ 0 goto error
)

:: 1\. Build to the repository path
call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\Solution1.sln" /p:Configuration=Release /verbosity:m /nologo %SCM_BUILD_ARGS%
IF !ERRORLEVEL! NEQ 0 goto error

call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\WebJob1\WebJob1.csproj" /nologo /verbosity:m /t:Build /t:pipelinePreDeployCopyAllFilesToOneFolder 
    /p:_PackageTempDir="%DEPLOYMENT_TEMP%";Configuration=Release /p:SolutionDir="%DEPLOYMENT_SOURCE%\.\\"

:: 2\. Package
IF EXIST "%DEPLOYMENT_TEMP%\bin" rd /s /q "%DEPLOYMENT_TEMP%\bin"
xcopy "%DEPLOYMENT_SOURCE%\PrecompiledWeb\localhost_52030" "%DEPLOYMENT_TEMP%" /E

:: 3\. KuduSync
IF /I "%IN_PLACE_DEPLOYMENT%" NEQ "1" (
  call :ExecuteCmd "%KUDU_SYNC_CMD%" -v 50 -f "%DEPLOYMENT_TEMP%" -t "%DEPLOYMENT_TARGET%" 
    -n "%NEXT_MANIFEST_PATH%" -p "%PREVIOUS_MANIFEST_PATH%" -i ".git;.hg;.deployment;deploy.cmd"
  IF !ERRORLEVEL! NEQ 0 goto error
)

IF EXIST "%DEPLOYMENT_TEMP%" rd /s /q "%DEPLOYMENT_TEMP%"

```

There are a few important things to note here:

*   In addition to solution wide package restore we have also added a restore command for the web site itself. It is needed because solution wide restore doesn’t restore packages of the web site itself! Note that when you exclude NuGet packages and .dll files from the Bin directory of the web site you need to make sure that .refresh files are not excluded because this is how web sites reference assemblies from NuGet packages.
*   We added 2 MSBuild commands. The first one precompiles the web site together with all class libraries that it references. The output is placed to PrecomiledWeb/localhost_52030 directory that is configured in the web site project’s settings. The second command builds and packages the web job using pipelinePreDeployCopyAllFilesToOneFolder target. As a result your web job is placed in the correct folder under %DEPLOYMENT_TEMP%/App_Data.
*   Then we move the precompiled web site to %DEPLOYMENT_TEMP% where the web job already is. We need to make sure to remove %DEPLOYMENT_TEMP%/bin folder first that contains the output of the web job project build. We don’t need it anymore as the web job is already in App_Data.
*   We then KuduSync the whole package to wwwroot.

## Stand-alone web jobs

In order to be able to scale web apps and web jobs independently or to prevent resource starvation you may want to deploy your web jobs into a separate web app. This scenario is supported for continuous deployment too but you’re going to need to create a custom deployment script as well.

Azure CLI does support console apps but you need to update it:

```
:: Deployment
:: ----------

echo Handling .NET Console Application deployment.

:: 1\. Restore NuGet packages
IF /I "TestWebJobs\TestWebJobs.sln" NEQ "" (
  call :ExecuteCmd nuget restore "%DEPLOYMENT_SOURCE%\TestWebJobs\TestWebJobs.sln"
  IF !ERRORLEVEL! NEQ 0 goto error
)

:: 2\. Build to the temporary path
call :ExecuteCmd "%MSBUILD_PATH%" "%DEPLOYMENT_SOURCE%\TestWebJobs\WebJob1\WebJob1.csproj" /nologo /verbosity:m 
    /t:Build /p:Configuration=Release;OutputPath="%DEPLOYMENT_TEMP%\app_data\jobs\continuous\deployedJob" 
    /p:SolutionDir="%DEPLOYMENT_SOURCE%\TestWebJobs\\" %SCM_BUILD_ARGS%
IF !ERRORLEVEL! NEQ 0 goto error

:: 3\. Run web job deploy script
IF DEFINED WEBJOBS_DEPLOY_CMD (
  call :ExecuteCmd "%WEBJOBS_DEPLOY_CMD%"
)

:: 4\. KuduSync
call :ExecuteCmd "%KUDU_SYNC_CMD%" -v 50 -f "%DEPLOYMENT_TEMP%" -t "%DEPLOYMENT_TARGET%" 
    -n "%NEXT_MANIFEST_PATH%" -p "%PREVIOUS_MANIFEST_PATH%" -i ".git;.hg;.deployment;deploy.cmd"
IF !ERRORLEVEL! NEQ 0 goto error

```

As you can see the problem is in the hard coded path %DEPLOYMENT_TEMP%\app_data\jobs\continuous\deployedJob that doesn’t take into account your job’s name and type.

There are two options here. You can either update the path with a correct job name and type or you can take advantage of build targets from Microsoft.Web.WebJobs.Publish similar to how it was done with a web site above. Just remember to add settings.job files with cron expressions to your scheduled jobs!