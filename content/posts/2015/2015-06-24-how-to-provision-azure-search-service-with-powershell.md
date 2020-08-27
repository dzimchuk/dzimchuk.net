---
title: How to provision Azure Search service with PowerShell
date: 2015-06-24T15:46:01.000Z
lastmod: 2017-09-05T19:43:25.000Z
permalink: how-to-provision-azure-search-service-with-powershell
excerpt: Azure Search Management API is built on top of Azure Resource Manager which is a new way of managing resource in Azure that you probably hear about more and more these days. The idea behind it is that instead of managing individual resources you start thinking in terms of your applications...
uuid: 606fc0eb-c5d2-4e5b-a5b9-4dea9bc66ac6
tags: Azure Services, Azure PowerShell, Azure Resource Manager, Azure Search
---

Azure Search Management API is built on top of Azure Resource Manager which is a new way of managing resource in Azure that you probably hear about more and more these days. The idea behind it is that instead of managing individual resources you start thinking in terms of your applications and what resources are needed for them. With powerful templates you can define resource groups containing resources that you need for your applications that you provision with literally a single command.

## Azure Resource Manager PowerShell

PowerShell for Azure Resource Manager (ARM) is basically a different set of cmdlets that you load into your Azure PowerShell session:

```
Switch-AzureMode -Name AzureResourceManager
Add-AzureAccount

```

Azure AD authentication is required for working with ARM cmdlets thus the `Add-AzureAccount` call which will present a sign-in form if invoked like shown above. This is something to be aware of if you want to make ARM part of your devops cycle where you would prefer unattended operation. It can be achieved with Microsoft organizational account or with a service principal which is defined as an application in Azure AD and once authenticated as such it can manage other resources through ARM.

## Azure Search ARM template

You can create your own templates to define resources that are needed for your solutions. But how do you know how to define those resources and what parameters they require? Your first answer is of course Google or Bing but there is another place you want to check out first and it’s called Resource Group Gallery:

```
Get-AzureResourceGroupGalleryTemplate

```

To our luck there is ‘Microsoft.Search.1.0.7’ template. Let’s have a look at it:

```
Get-AzureResourceGroupGalleryTemplate Microsoft.Search.1.0.7

```

```
Identity             : Microsoft.Search.1.0.7
Publisher            : Microsoft
Name                 : Search
Version              : 1.0.7
CategoryIds          : {azure, data, dataInsight, dataService...}
PublisherDisplayName : Microsoft
DisplayName          : Search
DefinitionTemplates  : https://gallerystoreprodch.blob.core.windows.net/prod-microsoft-windowsazure-gallery/Microsoft.S
                       earch.1.0.7/DeploymentTemplates/searchServiceDefaultTemplate.json
Summary              : Search-as-a-service solution
Description          : <p>Microsoft Azure Search is a search-as-a-service solution that allows developers to embed a
                       sophisticated search experience into web and mobile applications without having to worry about
                       the complexities of full-text search and without having to deploy, maintain or manage any
                       infrastructure. With Azure Search you can surface the power of searching data in your
                       application, reduce the complexity around managing and tuning a search index, and boost
                       development speed using familiar tools and a consistent platform.</p><p>Azure Search
                       Features:</p><ul><li>Powerful, reliable performance</li><li>Connect business goals to the
                       application</li><li>Scale out easily</li><li>Sophisticated search functionality</li><li>Fast
                       time to market</li><li>Simplify search index management</li></ul>

```

You can download the template with the link shown in the output above or you can use a PowerShell cmdlet:

```
Save-AzureResourceGroupGalleryTemplate -Identity Microsoft.Search.1.0.7 -Path d:\temp\azure_search.json

```

Let’s examine the template:

```
{
    "$schema": "http://schema.management.azure.com/schemas/2014-04-01-preview/deploymentTemplate.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "name": {
            "type": "string"
        },
        "location": {
            "type": "string"
        },
        "sku": {
            "type": "string"
        },
        "replicaCount": {
            "type": "int"
        },
        "partitionCount": {
            "type": "int"
        }
    },
    "resources": [
        {
            "apiVersion": "2015-02-28",
            "name": "[parameters('name')]",
            "type": "Microsoft.Search/searchServices",
            "location": "[parameters('location')]",
            "properties": {
            "sku": {
                    "name": "[parameters('sku')]"
            },
            "replicaCount": "[parameters('replicaCount')]",
            "partitionCount": "[parameters('partitionCount')]"
            }
        }
    ]
}

```

You immediately see what parameters are required: service name, region, pricing tier (free or standard), replica and partition count. The resource definition that is presented in the ‘resources’ collection gives you an idea of how you would define it in your custom templates.

## Provision a new Resource Group

With a template like the one shown above we can provision a new resource group which in turn will provision all resources defined in the template:

```
New-AzureResourceGroup -Location "West Europe" -Name TestGroup -GalleryTemplateIdentity Microsoft.Search.1.0.7
 -nameFromTemplate testd -locationFromTemplate "West Europe" -sku standard -replicaCount 1 -partitionCount 1

```

When typing in the command after you specify the gallery template name you will have parameter help triggered by TAB for the parameters defined in the template. This is really cool! Notice that the template’s `name` and `location` parameters are passed as `nameFromTemplate` and `locationFromTemplate` to avoid collision with similar parameters for the `New-AzureResourceGroup` cmdlet itself. If you omit some or all parameters from the template you will be prompted to input them when you hit Enter.

It takes a while to provision a new service:

![Provisining a new resource group with Azure Search service](https://blogcontent.azureedge.net/a43115c1-fd32-4d39-8e0d-b2856faa95a5.png)

## Provision a new service to an existing Resource Group

Instead of creating a new Resource Group we can provision resources defined in the template to an existing Resource Group:

```
New-AzureResourceGroupDeployment -ResourceGroupName TestGroup -GalleryTemplateIdentity Microsoft.Search.1.0.7
 -nameFromTemplate testd1 -location "West Europe" -sku standard -replicaCount 1 -partitionCount 1

```

## Resources

[Using Azure PowerShell with Azure Resource Manager](https://azure.microsoft.com/en-us/documentation/articles/powershell-azure-resource-manager/)  
[Authenticating a Service Principal with Azure Resource Manager](https://azure.microsoft.com/en-us/documentation/articles/resource-group-authenticate-service-principal/)  
[Get started with Azure Search Management REST API](https://azure.microsoft.com/en-us/documentation/articles/search-get-started-management-api/)