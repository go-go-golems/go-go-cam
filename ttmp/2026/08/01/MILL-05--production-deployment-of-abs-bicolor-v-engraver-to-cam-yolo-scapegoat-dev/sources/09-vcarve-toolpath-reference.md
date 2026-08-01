# Source

- URL: https://docs.vectric.com/docs/V12.0/VCarveDesktop/ENU/Help/form/VCarve%20Toolpath%20Creator/
- Retrieved: 2026-08-01

![](https://cdn.sanity.io/images/i7cqi3ri/12/bfb0a28d957bd85e66cbab5b5a25611d68ce6a8c-278x798.png)

This icon opens the V-Carving Toolpath form which is used to specify the type of carving required, 
details, cutting parameters and name for the toolpath.

V-Carving uses a constant angled cutter that's moved at flowing variable depth to create a 3D 
carved effect on the job. The software automatically calculates a path defined by the combination 
of the angle of the tool specified and the width and shape of the vectors being machined.

Watch this video to see this in action:

![](https://www.youtube.com/watch?v=h7FccWQT2TA)

## Cutting Depths

Start Depth (D) specifies the depth at which the V-Carving toolpath is calculated, allowing 
V-Carving / Engraving to be machined inside a pocket region. When cutting directly into the surface 
of a job the Start Depth will usually be 0.0. If the V-Carving / engraving is going to be machined 
into the bottom of a pocket or stepped region, the depth of the pocket / step must be entered. For 
example, to carve or engrave into the bottom of a 0.5 inch deep pocket, the Start Depth = 0.5 inches

### Start Depth (D)

Start Depth (D) specifies the depth at which the V-Carving toolpath is calculated, allowing 
V-Carving / Engraving to be machined inside a pocket region. When cutting directly into the surface 
of a job the Start Depth will usually be 0.0. If the V-Carving / engraving is going to be machined 
into the bottom of a pocket or stepped region, the depth of the pocket / step must be entered. For 
example, to carve or engrave into the bottom of a 0.5 inch deep pocket, the Start Depth = 0.5 inches

### Flat Depth (F)

Checking ✓ this option limits the depth that the tool(s) will machine to, and is used for Flat 
Bottomed Carving and Engraving.

When No Flat Depth is specified the toolpath will be calculated to carve or engrave to full depth 
as shown below. Multiple z level passes will be automatically calculated where the tool needs to 
cut deeper than its Pass Depth specified in the Tool Database

#### No Flat Depth

![](https://cdn.sanity.io/images/i7cqi3ri/12/6a773bdd84b26caca96c0f65e41e60f1fc00bc2b-386x195.png)

#### Flat Depth

![](https://cdn.sanity.io/images/i7cqi3ri/12/377882d932214e8db6ac2e0ddb44a2601022fb95-388x148.png)

#### Flat Depth Using 2 Tools

![](https://cdn.sanity.io/images/i7cqi3ri/12/8bf6c9224f44e5cb1176be8891f9343223693518-383x147.png)

## Tool

Clicking the button opens the Tool Database from which the required V-Carving or Engraving Tool can 
be selected. See the section on the Tool Database for more information on this.

Clicking the button opens the Edit Tool form which allows the cutting parameters for the selected 
tool to be modified, without changing the master information in the database. Note that Ball Nose 
tools can also be used to V-Carve designs.

## Use Clearance Tools

Check ✓ this option if you wish to use End Mill, Ball Nose or Engraving cutters to machine the 
large open regions of a design. If no tool is selected here but Flat Depth is specified then the 
selected V-Carving tool will be used to clear the flat areas as well as for the V-Carving. All the 
tools in this section will leave an allowance for the V-Carving tool. Subject to this, the first 
tool in the list will remove as much material as it can, whereas subsequent tools will only machine 
areas the previous tools could not fit. The order of the tools in the list should match the order 
they will be run on the machine.

Clicking the button opens the Tool Database from which the required clearance tool can be selected 
and added to the list.

Clicking the button will remove the selected tool from the list.

Clicking the button opens the Edit Tool form which allows the cutting parameters for the selected 
tool to be modified, without changing the master information in the database.

Clicking the up and down arrow buttons will move the selected tool up and down the list 
respectively.

## Clearance Tool Options

The strategy used to clear the material, either Offset or Raster, can be chosen for the first 
clearance toolpath. In the case of Raster, a Raster Angle can be entered.

The cutting direction, either Climb or Conventional, can be selected for each clearance tool.

Checking ✓ Ramp Plunge Moves applies ramping to the plunge moves of the clearance tool.

The above options are the same as those found on the Pocketing form.

Checking ✓ Corner Sharpen will raise the selected Engraving tool to fit the smaller tool tip into 
narrower regions. This option is available for a tool positioned second or later in the list.

## Use Vector Start Points

If this option is checked ✓, the start point of the profile and offset toolpath segments will be 
as close as possible to the start point of the corresponding boundary vector. Otherwise this is 
left up to the program.

## Use Vector Selection Order

If this option is checked ✓, the vectors will be machined in the order you selected them. If the 
option is not checked the program will optimize the order to reduce machining time.

## Position and Selection Properties

### Safe Z

The height above the job at which it is safe to move the cutter at rapid / max feed rate. This 
dimension can be changed by opening the Material Setup form.

### Home Position

Position from and to that the tool will travel before and after machining. This dimension can be 
changed by opening the Material Setup form.

### Project toolpath onto 3D Model

This option is only available if a 3D model has been defined. If this option is checked, ✓ after 
the toolpath has been calculated, it will be projected (or 'dropped') down in Z onto the surface of 
the 3D model. The depth of the original toolpath below the surface of the material will be used as 
the projected depth below the surface of the model.

**Note:**

When a toolpath is projected onto the 3D model, its depth is limited so that it does not exceed the 
bottom of the material.

### Vector Selection

This area of the toolpath page allows you to automatically select vectors to machine using the 
vector's properties or position. It is also the method by which you can create Toolpath Templates 
to re-use your toolpath settings on similar projects in the future. For more information, see the 
sections [Vector Selector and Advanced Toolpath 
Templates](https://docs.vectric.com/docs/V12.0/VCarveDesktop/ENU/Help/form/vector-selector/index.htm
l).

### Name

The name of the toolpath can be entered or the default name can be used.
