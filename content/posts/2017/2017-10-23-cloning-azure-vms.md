---
title: Cloning Azure VMs
date: 2017-10-23 12:02:49
permalink: cloning-azure-vms
excerpt: In order to enable deployment of preconfigured environments or to scale your IAAS workloads you may need clone your VMs. The process normally involves removing computer-specific information from the machine, capturing the VM image and then using this image when provisioning new VM instances.
uuid: fa9cbf4f-a6e1-4c55-99a0-68eaf47248c2
tags: Azure Virtual Machines, Azure PowerShell
---

In order to enable deployment of preconfigured environments or to scale your IAAS workloads you may need to clone your virtual machines. The process normally involves removing computer-specific information such as device drivers, administrator account and the computer security identifier (SID) from the machine, capturing the VM image and then using this image when provisioning new VM instances.

## Removing computer-specific information

The first step depends on the operating system as you use OS specific tools to set your machine to the generalized state.

### Windows

On Windows, run [Sysprep](https://docs.microsoft.com/en-us/windows-hardware/manufacture/desktop/sysprep--generalize--a-windows-installation) to clean up system identity and put it into `Out-of-Box experience` state.

```
%WINDIR%\system32\sysprep\sysprep.exe /generalize /shutdown /oobe
```

When it's done it's going to shut down the machine.

### Linux

On Linux, run the following command on Azure agent that's going to remove machine and user specific configuration:

```
sudo waagent -deprovision+user -force
```

Then `exit` the SSH session.

## Generalizing Azure VM

The next step is to deallocate the VM and set its status to `Generalized`:

```
Stop-AzureRmVM -Name Win01 -ResourceGroupName TestCloneVM -Force
Set-AzureRmVM -Name Win01 -ResourceGroupName TestCloneVM -Generalized
```

This is the Azure setting that is not OS specific.

## Capturing the VM image

This step depends on the type of storage used for the VM disks.

### Managed disks

If you use managed storage then you can directly create an Image resource consisting of disks that are attached to the machine.

```
New-AzureRmResourceGroup -Name TestImages -Location 'west europe'

$vm = Get-AzureRmVM -ResourceGroupName TestCloneVM -Name Win01
$imageConfig = New-AzureRmImageConfig -Location 'west europe' -SourceVirtualMachineId $vm.Id
New-AzureRmImage -Image $imageConfig -ImageName WinVM -ResourceGroupName TestImages
```

It creates a fully managed image:

```
$winImage = Get-AzureRmImage -ResourceGroupName TestImages -ImageName WinVM
$winImage.StorageProfile.OsDisk

OsType      : Windows
OsState     : Generalized
Snapshot    : 
ManagedDisk : Microsoft.Azure.Management.Compute.Models.SubResource
BlobUri     : 
Caching     : ReadWrite
DiskSizeGB  : 128
```

Notice that `BlobUri` contains no value. You can delete the original managed disk and use this image to provision new VMs.

### Unmanaged disks

If you use unmanaged disks you can save the image in the same storage account that is used for VM VHDs:

```
Save-AzureRmVMImage -ResourceGroupName TestCloneLinuxVM -Name Lin01 -DestinationContainerName vm-images -VHDNamePrefix LinVM
```

It's going to store the image under the predefined path `system/Microsoft.Compute/Images`, e.g.: `https://<account>.blob.core.windows.net/system/Microsoft.Compute/Images/vm-images/LinVM-osDisk.be6421b7-256f-4b34-b3ba-1d7bb54d4ae2.vhd`.

It's also going to generate an ARM template that can be used to provision VMs from this image.

Alternately, you may want to create an Image resource with `New-AzureRmImageConfig` and `New-AzureRmImage` just like you do for managed disks. In this case the Image resource will use the same VHDs that were part of the original VM:

```
$linuxImage = Get-AzureRmImage -ResourceGroupName TestImages -ImageName LinVM
$linuxImage.StorageProfile.OsDisk

OsType      : Linux
OsState     : Generalized
Snapshot    : 
ManagedDisk : 
BlobUri     : https://<account>.blob.core.windows.net/vhds/Lin01OsDisk.vhd
Caching     : ReadWrite
DiskSizeGB  : 128
```

It's also possible to create Image resources from multiple arbitrary VHDs (OS and data disks) as shown [here](https://docs.microsoft.com/en-us/powershell/module/azurerm.compute/new-azurermimageconfig?view=azurermps-4.4.0). So you can turn images captured with `Save-AzureRmVMImage` into proper Image resources.

## Creating VMs from custom images

If you want to create a VM from an Image resource you need to specify it when setting up the VM configuration:

```
$image = Get-AzureRmImage -ResourceGroupName $ImageResourceGroupName -ImageName $ImageName
$vm = Set-AzureRmVMSourceImage `
    -VM $vm `
    -Id $image.Id
```

Then you use `FromImage` option when configuring the OS disk:

```
$osDiskName = $VMName + 'OsDisk'
$vm = Set-AzureRmVMOSDisk `
    -VM $vm `
    -Name $osDiskName `
    -DiskSizeInGB 128 `
    -CreateOption FromImage `
    -Caching ReadWrite `
    -StorageAccountType StandardLRS
```

If you want to go with unmanaged disks you can specify the path where the VHD will be stored:

```
$storageAccount = Get-AzureRmStorageAccount -ResourceGroupName $StorageAccountResourceGroupName -Name $StorageAccountName

$blobEndpoint = $storageAccount.PrimaryEndpoints.Blob.ToString()
$osDiskName = $VMName + 'OsDisk'
$osDiskUri = $blobEndpoint + "vhds/" + $osDiskName  + ".vhd"

$vm = Set-AzureRmVMOSDisk `
    -VM $vm `
    -Name $osDiskName `
    -DiskSizeInGB 128 `
    -CreateOption FromImage `
    -Caching ReadWrite `
    -VhdUri $osDiskUri
```

If you want to use arbitrary VHD images captured with `Save-AzureRmVMImage` you can do it directly with `Set-AzureRmVMOSDisk` without having to call `Set-AzureRmVMSourceImage`:

```
$vm = Set-AzureRmVMOSDisk `
    -VM $vm `
    -Name $osDiskName `
    -SourceImageUri $SourceImageUri `
    -Linux `
    -VhdUri $osDiskUri `
    -DiskSizeInGB 128 `
    -CreateOption FromImage `
    -Caching ReadWrite
```

`$SourceImageUri` is the path to your image, e.g. `https://<account>.blob.core.windows.net/system/Microsoft.Compute/Images/vm-images/LinVM-osDisk.be6421b7-256f-4b34-b3ba-1d7bb54d4ae2.vhd`. And `VhdUri` is the path to the new unmanaged OS disk of the provisioned VM.

Below you can find links to PowerShell scripts that can be used to create VMs from different types of custom images:

- New [Linux VM](https://github.com/dzimchuk/azure-automation/blob/master/VirtualMachine/New-LinuxVMFromGeneralizedImage.ps1) with a managed OS disk from a generalized custom Image
- New [Linux VM](https://github.com/dzimchuk/azure-automation/blob/master/VirtualMachine/New-LinuxVMFromGeneralizedVHDWithUnmanagedOSDisk.ps1) with an unmanaged OS disk from a generalized VHD
- New [Linux VM](https://github.com/dzimchuk/azure-automation/blob/master/VirtualMachine/New-LinuxVMWithUnmanagedOSDisk.ps1) with an unmanaged OS disk from a gallary image
- New [Windows VM](https://github.com/dzimchuk/azure-automation/blob/master/VirtualMachine/New-VM.ps1) with a managed disk from a gallary image