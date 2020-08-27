---
title: Automating Azure Search index operations
date: 2015-07-01T16:19:48.000Z
lastmod: 2017-09-05T19:43:44.000Z
permalink: automating-azure-search-index-operations
excerpt: Last time we had a look at provisioning Azure Search service with Azure Resource Manager and PowerShell. The next step is to set up an index (or indexes) and decide how we are going to populate it. We should also index existing data for the first time once the index has been created.
uuid: de9984a0-b4eb-43e9-a230-597c1880a9e4
tags: Azure Services, Azure PowerShell, Azure Search
---

Last time we had a look at provisioning Azure Search service with Azure Resource Manager and PowerShell. The next step is to set up an index (or indexes) and decide how we are going to populate it. We should also index existing data for the first time once the index has been created. Automating these operations will enable us to re-build the index from scratch at any moment. This can be required not only during a new deployment to a new environment but also when necessary changes have been applied to our data structure.

## Indexing strategy

As you probably know there are two models or strategies to populate indexes: pull and push. With the pull model you create a data source and an indexer instance and the indexer will pull the data from the data source on a defined schedule. This will work if your data is in Azure SQL or DocumentDB but in other cases you're going to have to rely on the push model where you send documents to the service yourself.

The push model is also preferable when it's not possible to provide effective change and delete policies to optimize the indexer. In most realistic scenarios indexed data won't come from a single table and as we'll discuss data sources and change tracking later in the post you will see that existing policies may not often meet your requirements.

Push model is not only used for incremental changes. Automating it is important as you want to be able to re-build your indexes from scratch.

## Test data

We need some test data to index and I'm going to use a well-known AdventureWorks sample database for it. You can find a version of the database that can be easily loaded into SQL Azure [here](http://msftdbprodsamples.codeplex.com/releases/view/37304).

You need to provision a new instance of Azure SQL server and make sure to add your IP to the white list. Then just unpack the archive and run the following command:

```
CreateAdventureWorksForSQLAzure.cmd <server>.database.windows.net <user>@<server> <password>

```

## Automation helpers

I've created a bunch of PowerShell modules and samples scripts that you can find [here](https://github.com/dzimchuk/azure-search/tree/master/automation). In the 'lib' directory there are modules for managing indexes, data sources, indexers and a module to index documents using the push model. These modules are basically simple wrappers around corresponding [REST APIs](https://msdn.microsoft.com/en-us/library/azure/dn798935.aspx). Request payloads are specified in json files under 'definitions' folder and they are in form as expected by the APIs so when creating your own definitions please refer to the documentation of appropriate APIs.

Although we’re going to be looking mostly at creation scripts the modules implement all of the available APIs and can be incorporated into your devops flows.

## Creating an index

You can look at an existing [CreateIndex.ps1](https://github.com/dzimchuk/azure-search/blob/master/automation/CreateIndex.ps1) script as an example of how you would use Index module:

```
param (
   [string] 
   $serviceName = $(throw "-serviceName is required."),

   [string]
   $serviceKey = $(throw "-serviceKey is required."),

   [string] 
   $definitionName = $(throw "-definitionName is required.")
)

Import-Module (Join-Path (Join-Path $PSScriptRoot "lib") "Credentials.psm1") -DisableNameChecking
Import-Module (Join-Path (Join-Path $PSScriptRoot "lib") "Index.psm1") -DisableNameChecking
Import-Module (Join-Path (Join-Path $PSScriptRoot "lib") "Definition.psm1") -DisableNameChecking

$ErrorActionPreference = "Stop"

Set-Credentials $serviceName $serviceKey

$definition = Get-Definition $definitionName

$index = Get-Index $definition.name
if ($index -ne $null)
{
   Delete-Index $definition.name
}

Create-Index $definition

```

## Creating a data source

[CreateDataSource.ps1](https://github.com/dzimchuk/azure-search/blob/master/automation/CreateDataSource.ps1) script logic is almost the same as above. The only difference is that the data source creation script requires a connection string to your Azure SQL database or DocumentDB. I didn't want to put it in the definition file because it's so easy to forget and check into a source control system.

There are two optional but rather important properties in the data source definition: change and delete detection policies. They will help the indexer that we're going to create at the next step to detect changes in your source data. You can find a detailed description of available policies in the [API documentation](https://msdn.microsoft.com/en-us/library/azure/dn946876.aspx).

Because we are using a view rather than a table we can't take advantage of integrated change tracking and adding a watermark column to the view can be tricky (but possible as all tables that are selected in the view have LastModified columns).

As I mentioned before, if change and delete policies cannot be applied to your data source you are much better off switching to the push model. For example, the only delete policy that is currently supported is Soft Delete meaning that instead of actually deleting documents you mark them as deleted by setting a flag in a special column. It can be exactly your scenario but in a lot of cases it's not.

## Creating an indexer

[CreateIndexer.ps1](https://github.com/dzimchuk/azure-search/blob/master/automation/CreateIndexer.ps1) implements a similar logic as well. Indexer definition ties all of the pieces together:

```
{ 
    "name" : "product-and-description-indexer",
    "dataSourceName" : "product-and-description-datasource",
    "targetIndexName" : "product-and-description",
    "schedule" : { "interval" : "PT30M", "startTime" : "2015-07-01T00:00:00Z" }
}

```

The schedule specifies that the indexer should start running on July, 1 2015 and should re-index documents each half an hour. If you haven't specified a scheduler the indexer will run right after it has been created. It may take some time depending on the amount of your data for it to finish but in our case it finished in just a few seconds.

You can run the indexer explicitly with the [RunIndexer.ps1](https://github.com/dzimchuk/azure-search/blob/master/automation/RunIndexer.ps1) script:

```
param (
   [string] 
   $serviceName = $(throw "-serviceName is required."),

   [string]
   $serviceKey = $(throw "-serviceKey is required."),

   [string] 
   $indexerName = $(throw "-indexerName is required.")
)

Import-Module (Join-Path (Join-Path $PSScriptRoot "lib") "Credentials.psm1") -DisableNameChecking
Import-Module (Join-Path (Join-Path $PSScriptRoot "lib") "Indexer.psm1") -DisableNameChecking

$ErrorActionPreference = "Stop"

Set-Credentials $serviceName $serviceKey

Run-Indexer $indexerName
Start-Sleep -Seconds 3

$running = $true

while($running)
{
   $status = Get-IndexerStatus $indexerName
   if ($status.lastResult -ne $null)
   {
       switch($status.lastResult.status)
       {
           "inProgress" 
           { 
               Write-Host 'Synchronizing...'
               Start-Sleep -Seconds 3
           }
           "success" 
           {
               $processed = $status.lastResult.itemsProcessed
               $failed = $status.lastResult.itemsFailed
               Write-Host "Items processed: $processed, Items failed: $failed"
               $running = $false
           }
           default 
           {
               Write-Host "Synchronization failed: " + $status.lastResult.errorMessage
               $running = $false
           }
       }
   }
   else
   {
       Write-Host "Indexer status: " + $status.status
       $running = $false
   }
}

```

As you can see it implements a loop requesting the indexer's status as it processes data. In our simple case it finished almost immediately. As I mentioned change and delete detection policies are useful for efficient re-indexing.

## Pushing documents for indexing

[IndexDocuments.ps1](https://github.com/dzimchuk/azure-search/blob/master/automation/IndexDocuments.ps1) script can help you re-build your index from scratch when either the data source is not supported by the indexer or don't want to go with the pull model.

The definition json file is in fact documents themselves:

```
{
  "value": [
    {
      "@search.action": "mergeOrUpload",
      "ProductID": "1",
      "Name": "Mountain-400 Silver",
      "ProductModel": "Mountain-400",
      "CultureID": "en", 
      "Description": "This bike delivers a high-level of performance on a budget. It is responsive and maneuverable, and offers peace-of-mind when you decide to go off-road."
    },
    {
      "@search.action": "mergeOrUpload",
      "ProductID": "2",
      "Name": "Mountain-500 Black, 42se",
      "ProductModel": "Mountain-500",
      "CultureID": "en",
      "Description": "Suitable for any type of riding, on or off-road. Fits any budget. Smooth-shifting with a comfortable ride."
    }
  ]
}

```

## Resources

[Azure Search Service REST API](https://msdn.microsoft.com/en-us/library/azure/dn798935.aspx)