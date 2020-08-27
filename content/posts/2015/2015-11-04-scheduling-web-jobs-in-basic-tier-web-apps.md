---
title: Scheduling web jobs in Basic tier web apps
date: 2015-11-04T15:19:44.000Z
lastmod: 2017-09-05T19:33:52.000Z
permalink: scheduling-web-jobs-in-basic-tier-web-apps
excerpt: You have an application application that is deployed to an Azure Web App running in Basic App Service hosting plan. You have a couple of web jobs scheduled with cron expressions. One day you noticed that these schedules never fired...
uuid: 5e4eb45f-8cff-44a0-8d72-274f1698fb92
tags: Azure App Services, Azure Services, Azure PowerShell
---

You have an application that is deployed to an Azure Web App running in Basic App Service hosting plan. You have a couple of web jobs there that are supposed to run on schedule and you chose to define the schedules with [cron expressions](http://www.amitapple.com/post/2015/06/scheduling-azure-webjobs/#.VjpFxzaheHn). One day you noticed that these schedules never fired even though you remembered how you tested them on the Free plan and they seemed to work. You have Always On enabled as you want Kudu to always run to be able to trigger your scheduled jobs.

You check the state of your scheduled job with the following GET request:

```
GET https://{website}.scm.azurewebsites.net/api/triggeredwebjobs/{jobname} HTTP/1.1
Authorization: Basic <your deployment credentials>

```

The response may look something like this:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
     "latest_run": null,
     "history_url": "https://{website}.scm.azurewebsites.net/api/triggeredwebjobs/{jobname}/history",
     "scheduler_logs_url": "https://{website}.scm.azurewebsites.net/vfs/data/jobs/triggered/{jobname}/job_scheduler.log",
     "name": "TestJob",
     "run_command": "{jobexecutable}.exe",
     "url": "https://{website}.scm.azurewebsites.net/api/triggeredwebjobs/{jobname}",
     "extra_info_url": "https://{website}.scm.azurewebsites.net/azurejobs/#/jobs/triggered/{jobname}",
     "type": "triggered",
     "error": null,
     "using_sdk": true,
     "settings": {
          "schedule": "0 0 2 * * *"
     }
}

```

If you triggered the task before, for instance manually, the 'latest_run' property will contain a state object of the last run attempt including a URL to the output log. You see that the schedule has been picked up and you expect the task to run at 2AM every day. Once you have checked out the scheduler logs:

```
GET https://{website}.scm.azurewebsites.net/vfs/data/jobs/triggered/{jobname}/job_scheduler.log HTTP/1.1
Authorization: Basic <your deployment credentials>

HTTP/1.1 200 OK
Content-Type: application/octet-stream

[10/12/2015 06:18:27 > bfef75: SYS INFO] 'Basic' tier website doesn`t support scheduled WebJob.
[10/20/2015 05:10:10 > 2613fc: SYS INFO] 'Basic' tier website doesn`t support scheduled WebJob.
[10/20/2015 14:50:35 > 2613fc: SYS INFO] 'Basic' tier website doesn`t support scheduled WebJob.
[10/21/2015 02:32:37 > 882beb: SYS INFO] 'Basic' tier website doesn`t support scheduled WebJob.

```

I bet you’re ready to exclaim…

## WTF?

It has to be some marketing trick! Technically all you need is Always On which is supported on Basic and Standard tiers as you run a dedicated resource (read VM, well at least a separate application pool) and it's possible to configure the start mode of your application pool to AlwaysRunning.

Now why did it work on the Free tier? Perhaps they wanted to give you a taste of it or enable you to use the Free plan for development and testing activities and then you were supposed move to Standard for the show time. But why can't you use a perfectly valid Basic plan option when your application isn't that big and you can save a few bucks?

## Using an external trigger

When you deploy from VS Microsoft.Web.WebJobs.Publish package sets up a free [Azure Scheduler](https://azure.microsoft.com/en-us/services/scheduler/) collection and adds scheduler jobs for your scheduled web jobs so they are triggered externally. In fact, you can trigger an On-Demand or a scheduled task with the following POST request (note that both On-Demand and scheduled jobs are referred to as triggered in terms of Kudu):

```
POST https://{website}.scm.azurewebsites.net/api/triggeredwebjobs/{jobname}/run HTTP/1.1
Authorization: Basic <your deployment credentials>

HTTP/1.1 202 Accepted

```

You have to authenticate when making requests to Kudu. When you run them in the browser it will send your cookie but you can also use Basic authentication to run them from anywhere else. You need to use your deployment credentials which are associated with your live account. Now this is another twisted thing, please see [this article](https://github.com/projectkudu/kudu/wiki/Deployment-credentials) for the explanation. The twisted part is that you define or reset your deployment credentials on one of your web app's settings blade but it's going to work with all apps as it's an account-wide setting.

![Deployment credentials reset blade](https://blogcontent.azureedge.net/f898b5ca-67c0-4895-a015-d7439b795e1d.png)

Once you have your credentials all you need is to Base64 encode them:

```
var credentials ="username:password";
var bytes = Encoding.UTF8.GetBytes(credentials);
var value = Convert.ToBase64String(bytes);

```

You are now ready to set up an external trigger preferably with an automation option that is supported by your chosen scheduling system. You can use external solutions or you can choose [Azure Scheduler](https://azure.microsoft.com/en-us/services/scheduler/).

One important thing to note about Azure Scheduler is that there can be only one free collection per Azure subscription that can contain up to 5 jobs. Pretty limiting but still can be used for your smaller applications. Another thing to note is that although Azure Scheduler supports a whole bunch of [outbound authentication options](https://azure.microsoft.com/en-us/documentation/articles/scheduler-outbound-authentication/) for your jobs they are not supported on the Free [tier](https://azure.microsoft.com/en-us/pricing/details/scheduler/).

## But how does it work when deploying from VS?

Yes, it's another twist. If you try to set up a job on the portal input controls for Basic authentication credentials will be grayed out:

![Grayed out input controls for Basic credentials](https://blogcontent.azureedge.net/1482bbfe-1f2e-4c00-95e4-d7f6bdafaac3.png)

But you can still define the Authorization header directly:

![Custom job HTTP headers](https://blogcontent.azureedge.net/3d8b3eff-cbce-4e0f-8cb5-06967dc939bd.png)

Is it a bug? Or a temporary workaround? Whatever it is you may also want to automate your schedule creation and you can do that with PowerShell:

```
New-AzureSchedulerJobCollection -JobCollectionName "TestCollection" -Location "West Europe" -Plan "Free"
$headers = @{"Authorization" = "Basic {your deployment credentials}"}
New-AzureSchedulerHttpJob -JobCollectionName "TestCollection" -JobName "TestJob" -Location "West Europe" -Method "POST" -URI https://{website}.scm.azurewebsites.net/api/triggeredwebjobs/{jobname}/run -Headers $headers -Frequency "Day" -Interval 1

```

It's going to create a job in a free collection that will run once a day.