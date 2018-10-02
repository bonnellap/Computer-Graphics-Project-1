// MultiJointModel.js (c) 2012 matsuda and itami
// Vertex shader program
var VSHADER_SOURCE =
  'attribute vec4 a_Position;\n' +
  'attribute vec4 a_Normal;\n' +
  'uniform mat4 u_MvpMatrix;\n' +
  'uniform mat4 u_NormalMatrix;\n' +
  'varying vec4 v_Color;\n' +
  'void main() {\n' +
  '  gl_Position = u_MvpMatrix * a_Position;\n' +
  // Shading calculation to make the arm look three-dimensional
  '  vec3 lightDirection = normalize(vec3(0.0, 0.5, 0.7));\n' + // Light direction
  '  vec4 color = vec4(1.0, 0.4, 0.0, 1.0);\n' +  // Robot color
  '  vec3 normal = normalize((u_NormalMatrix * a_Normal).xyz);\n' +
  '  float nDotL = max(dot(normal, lightDirection), 0.0);\n' +
  '  v_Color = vec4(color.rgb * nDotL + vec3(0.1), color.a);\n' +
  '}\n';

// Fragment shader program
var FSHADER_SOURCE =
  '#ifdef GL_ES\n' +
  'precision mediump float;\n' +
  '#endif\n' +
  'varying vec4 v_Color;\n' +
  'void main() {\n' +
  '  gl_FragColor = v_Color;\n' +
  '}\n';

function main() {
  // Retrieve <canvas> element
  var canvas = document.getElementById('webgl');

  // Get the rendering context for WebGL
  var gl = getWebGLContext(canvas);
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }

  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
    return;
  }

  // Set the vertex information
  var n = initVertexBuffers(gl);
  if (n < 0) {
    console.log('Failed to set the vertex information');
    return;
  }

  // Set the clear color and enable the depth test
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  // Get the storage locations of uniform variables
  var u_MvpMatrix = gl.getUniformLocation(gl.program, 'u_MvpMatrix');
  var u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
  if (!u_MvpMatrix || !u_NormalMatrix) {
    console.log('Failed to get the storage location');
    return;
  }

  // Calculate the view projection matrix
  var viewProjMatrix = new Matrix4();
  viewProjMatrix.setPerspective(50.0, canvas.width / canvas.height, 1.0, 100.0);
  viewProjMatrix.lookAt(20.0, 10.0, 30.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0);

  // Register the event handler to be called on key press
  document.onkeydown = function(ev){ keydown(ev, gl, n, viewProjMatrix, u_MvpMatrix, u_NormalMatrix); };

　draw(gl, n, viewProjMatrix, u_MvpMatrix, u_NormalMatrix); // Draw the robot arm
}

var ANGLE_STEP = 3.0;	//The increments of rotation angle (degrees)
var SPIN_STEP = 1.0;	//The increments of rotation for spinning
var SCALE_STEP = 11/10;	//The increments of scaling the model
var x_baseAngle = 0.0;	//The base angle of rotation along the x-axis
var y_baseAngle = 0.0;	//The base angle of rotation along the y-axis
var z_baseAngle = 0.0;	//The base angle of rotation along the z-axis
var y_spinAngle = 0.0;	//The spin angle which will be applied to all layers
var x_scale = 1.0;		//The base scale value along the x-axis
var y_scale = 1.0;		//The base scale value along the y-axis
var z_scale = 1.0;		//The base scale value along the z-axis
var x_shearAngle = 0.0;	//The base shear value along the x-axis
var y_shearAngle = 0.0;	//The base shear value along the y-axis
var z_shearAngle = 0.0;	//The base shear value along the z-axis
var x_translate = 0.0;	//The base translation along the x-axis
var y_translate = 0.0;	//The base translation along the y-axis
var z_translate = 0.0;	//The base translation along the z-axis
var x_reflect = 1.0;
var y_reflect = 1.0;
var z_reflect = 1.0;

function keydown(ev, gl, n, viewProjMatrix, u_MvpMatrix, u_NormalMatrix) {
  //Transformation matrixes on (1,2,3):
  //Translation:
  //	[1 0 0 tx] [1]   [1+tx]
  //	[0 1 0 ty].[2] = [2+ty]
  //	[0 0 1 tz] [3]   [3+tz]
  //	[0 0 0 1 ] [1]   [1   ]
  //Scaling:
  //	[sx 0  0  0] [1]   [sx  ]
  //	[0  sy 0  0].[2] = [2*sy]
  //	[0  0  sz 0] [3]   [3*sz]
  //	[0  0  0  1] [1]   [1   ]
  //Rotation (x-axis):
  //	[1 0      0       0] [1]   [1              ]
  //	[0 cos(a) -sin(a) 0].[2] = [2cos(a)-3sin(a)]
  //	[0 sin(a) cos(a)  0] [3]   [2sin(a)+3cos(a)]
  //	[0 0      0       1] [1]   [1              ]
  //Rotation (y-axis):
  //	[cos(a)  0 sin(a) 0] [1]   [cos(a)+3sin(a) ]
  //	[0       1 0      0].[2] = [2              ]
  //	[-sin(a) 0 cos(a) 0] [3]   [-sin(a)+3cos(a)]
  //	[0       0 0      1] [1]   [1              ]
  //Rotation (z-axis):
  //	[cos(a) -sin(a) 0 0] [1]   [cos(a)-2sin(a)]
  //	[sin(a) cos(a)  0 0].[2] = [sin(a)+2cos(a)]
  //	[0      0       1 0] [3]   [3             ]
  //	[0      0       0 1] [1]   [1             ]
  //Mirroring (xy):
  //	[1 0 0  0] [1]   [1 ]
  //	[0 1 0  0].[2] = [2 ]
  //	[0 0 -1 0] [3]   [-3]
  //	[0 0 0  1] [1]   [1 ]
  //Mirroring (yz):
  //	[-1 0 0 0] [1]   [-1]
  //	[0  1 0 0].[2] = [2 ]
  //	[0  0 1 0] [3]   [3 ]
  //	[0  0 0 1] [1]   [1 ]
  //Mirroring (xz):
  //	[1 0  0 0] [1]   [1 ]
  //	[0 -1 0 0].[2] = [-2]
  //	[0 0  1 0] [3]   [3 ]
  //	[0 0  0 1] [1]   [1 ]
  //Shearing:
  //	[1   shx 0   0] [1]   [1+2shx    ]
  //	[shy 1   shz 0].[2] = [shy+2+3shz]
  //	[0   0   1   0] [3]   [3         ]
  //	[0   0   0   1] [1]   [1         ]
  switch (ev.keyCode) {
	case 13: // Enter key -> reset the pyramid
	  g_baseAngle = 0.0;
	  x_baseAngle = 0.0;
	  y_baseAngle = 0.0;
	  z_baseAngle = 0.0;
	  y_spinAngle = 0.0;
	  x_scale = 1.0;
	  y_scale = 1.0;
	  z_scale = 1.0;
	  x_shearAngle = 0.0;
	  y_shearAngle = 0.0;
	  z_shearAngle = 0.0;
	  x_translate = 0.0;
	  y_translate = 0.0;
	  z_translate = 0.0;
	  x_reflect = 1.0;
	  y_reflect = 1.0;
	  z_reflect = 1.0;
	  break;
    case 40: // Up arrow key -> the positive rotation of the model around the x-axis
      x_baseAngle += ANGLE_STEP % 360;
      break;
    case 38: // Down arrow key -> the negative rotation of the model around the x-axis
      x_baseAngle -= ANGLE_STEP % 360;
      break;
    case 39: // Right arrow key -> the positive rotation of the model around the y-axis
      y_baseAngle += ANGLE_STEP % 360;
      break;
    case 37: // Left arrow key -> the negative rotation of the model around the y-axis
	  y_baseAngle -= ANGLE_STEP % 360;
      break;
	case 90: // 'z'key -> the positive rotation of the z-axis
	  z_baseAngle += ANGLE_STEP % 360;
	  break;
	case 88: // 'x'key -> the negative rotation of the z-axis
	  z_baseAngle -= ANGLE_STEP % 360;
	  break;
    case 67: // 'c'key -> spin the layers in the positive direction
	  y_spinAngle = (y_spinAngle - SPIN_STEP) % 360;
      break; 
    case 86: // 'v'key -> spin the layers in the negative direction
      y_spinAngle = (y_spinAngle + SPIN_STEP) % 360;
      break;
    case 65: // 'a'key -> scale all dimensions larger
	  if(x_scale < 3.0) x_scale *= SCALE_STEP;
	  if(y_scale < 3.0) y_scale *= SCALE_STEP;
	  if(z_scale < 3.0) z_scale *= SCALE_STEP;
      break;
    case 81: // 'q'key -> scale all dimensions smaller
	  if(x_scale > 1/3) x_scale *= 1/SCALE_STEP;
	  if(y_scale > 1/3) y_scale *= 1/SCALE_STEP;
	  if(z_scale > 1/3) z_scale *= 1/SCALE_STEP;
      break;
	case 83: // 's'key -> scale x-dimension larger
	  if(x_scale < 3.0) x_scale *= SCALE_STEP;
	  break;
	case 87: // 'w'key -> scale x-dimension smaller
	  if(x_scale > 1/3) x_scale *= 1/SCALE_STEP;
	  break;
	case 68: // 'd'key -> scale y-dimension larger
	  if(y_scale < 3.0) y_scale *= SCALE_STEP;
	  break;
	case 69: // 'e'key -> scale y-dimension smaller
	  if(y_scale > 1/3) y_scale *= 1/SCALE_STEP;
	  break;
	case 70: // 'f'key -> scale z-dimension larger
	  if(z_scale < 3.0) z_scale *= SCALE_STEP;
	  break;
	case 82: // 'r'key -> scale y-dimension smaller
	  if(z_scale > 1/3) z_scale *= 1/SCALE_STEP;
	  break;
	case 71: // 'g'key -> shear +x
	  if(x_shearAngle < 60.0) x_shearAngle = (x_shearAngle + ANGLE_STEP) % 360;
	  break;
	case 84: // 't'key -> shear -x
	  if(x_shearAngle > -60.0) x_shearAngle = (x_shearAngle - ANGLE_STEP) % 360;
	  break;
	case 72: // 'h'key -> shear +y
	  if(y_shearAngle < 60.0) y_shearAngle = (y_shearAngle + ANGLE_STEP) % 360;
	  break;
	case 89: // 'y'key -> shear -y
	  if(y_shearAngle > -60.0) y_shearAngle = (y_shearAngle - ANGLE_STEP) % 360;
	  break;
	case 74: // 'j'key -> shear +z
	  if(z_shearAngle < 60.0) z_shearAngle = (z_shearAngle + ANGLE_STEP) % 360;
	  break;
	case 85: // 'u'key -> shear -z
	  if(z_shearAngle > -60.0) z_shearAngle = (z_shearAngle - ANGLE_STEP) % 360;
	  break;
	case 75: // 'k' key -> translate x
	  if(x_translate < 5.0) x_translate += 0.5;
	  break;
	case 73: // 'i' key -> translate x
	  if(x_translate > -5.0) x_translate -= 0.5;
	  break;
	case 76: // 'l' key -> translate y
	  if(y_translate < 5.0) y_translate += 0.5;
	  break;
	case 79: // 'o' key -> translate y
	  if(y_translate > -5.0) y_translate -= 0.5;
	  break;
	case 186: // ';' key -> translate z
	  if(z_translate < 5.0) z_translate += 0.5;
	  break;
	case 80: // 'p' key -> translate z
	  if(z_translate > -5.0) z_translate -= 0.5;
	  break;
	case 49: // '1' key -> reflect yz axis
	  x_reflect = -x_reflect;
	  break;
	case 50: // '2' key -> reflect xz axis
	  y_reflect = -y_reflect;
	  break;
	case 51: // '3' key -> reflect xy axis
	  z_reflect = -z_reflect;
	  break;
    default: return; // Skip drawing at no effective action
  }
  // Draw the robot arm
  draw(gl, n, viewProjMatrix, u_MvpMatrix, u_NormalMatrix);
}

function initVertexBuffers(gl) {
  // Coordinates（Cube which length of one side is 1 with the origin on the center of the bottom)
  var vertices = new Float32Array([
    0.5, 1.0, 0.5, -0.5, 1.0, 0.5, -0.5, 0.0, 0.5,  0.5, 0.0, 0.5, // v0-v1-v2-v3 front
    0.5, 1.0, 0.5,  0.5, 0.0, 0.5,  0.5, 0.0,-0.5,  0.5, 1.0,-0.5, // v0-v3-v4-v5 right
    0.5, 1.0, 0.5,  0.5, 1.0,-0.5, -0.5, 1.0,-0.5, -0.5, 1.0, 0.5, // v0-v5-v6-v1 up
   -0.5, 1.0, 0.5, -0.5, 1.0,-0.5, -0.5, 0.0,-0.5, -0.5, 0.0, 0.5, // v1-v6-v7-v2 left
   -0.5, 0.0,-0.5,  0.5, 0.0,-0.5,  0.5, 0.0, 0.5, -0.5, 0.0, 0.5, // v7-v4-v3-v2 down
    0.5, 0.0,-0.5, -0.5, 0.0,-0.5, -0.5, 1.0,-0.5,  0.5, 1.0,-0.5  // v4-v7-v6-v5 back
  ]);

  // Normal
  var normals = new Float32Array([
    0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0, // v0-v1-v2-v3 front
    1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0, // v0-v3-v4-v5 right
    0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0, // v0-v5-v6-v1 up
   -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, // v1-v6-v7-v2 left
    0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0, // v7-v4-v3-v2 down
    0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0  // v4-v7-v6-v5 back
  ]);

  // Indices of the vertices
  var indices = new Uint8Array([
     0, 1, 2,   0, 2, 3,    // front
     4, 5, 6,   4, 6, 7,    // right
     8, 9,10,   8,10,11,    // up
    12,13,14,  12,14,15,    // left
    16,17,18,  16,18,19,    // down
    20,21,22,  20,22,23     // back
  ]);

  // Write the vertex property to buffers (coordinates and normals)
  if (!initArrayBuffer(gl, 'a_Position', vertices, gl.FLOAT, 3)) return -1;
  if (!initArrayBuffer(gl, 'a_Normal', normals, gl.FLOAT, 3)) return -1;

  // Unbind the buffer object
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Write the indices to the buffer object
  var indexBuffer = gl.createBuffer();
  if (!indexBuffer) {
    console.log('Failed to create the buffer object');
    return -1;
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return indices.length;
}

function initArrayBuffer(gl, attribute, data, type, num) {
  // Create a buffer object
  var buffer = gl.createBuffer();
  if (!buffer) {
    console.log('Failed to create the buffer object');
    return false;
  }
  // Write date into the buffer object
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // Assign the buffer object to the attribute variable
  var a_attribute = gl.getAttribLocation(gl.program, attribute);
  if (a_attribute < 0) {
    console.log('Failed to get the storage location of ' + attribute);
    return false;
  }
  gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
  // Enable the assignment of the buffer object to the attribute variable
  gl.enableVertexAttribArray(a_attribute);

  return true;
}

//Create a reflect function
Matrix4.prototype.setReflect = function(x_ref, y_ref, z_ref) {
	var e = this.elements;
	
	//The transformation function for shearing
	e[0] = x_ref; e[4] = 0; e[8] = 0; e[12] = 0;
	e[1] = 0; e[5] = y_ref; e[9] = 0; e[13] = 0;
	e[2] = 0; e[6] = 0; e[10] = z_ref; e[14] = 0;
	e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
	
	return this;
}

//Reflect function using the setReflect function
Matrix4.prototype.reflect = function(x_ref, y_ref, z_ref) {
	return this.concat(new Matrix4().setReflect(x_ref, y_ref, z_ref));
}

//Create a shear function
Matrix4.prototype.setShear = function(angle_x, angle_y, angle_z) {
	var shx = -Math.tan(angle_x * Math.PI / 180);
	var shy = -Math.tan(angle_y * Math.PI / 180);
	var shz = -Math.tan(angle_z * Math.PI / 180);
	var e = this.elements;
	
	//The transformation function for shearing
	e[0] = 1; e[4] = shx; e[8] = 0; e[12] = 0;
	e[1] = shy; e[5] = 1; e[9] = shz; e[13] = 0;
	e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
	e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
	
	return this;
}

//Shear function using the setShear function
Matrix4.prototype.shear = function(angle_x, angle_y, angle_z) {
	return this.concat(new Matrix4().setShear(angle_x, angle_y, angle_z));
}

// Coordinate transformation matrix
var g_modelMatrix = new Matrix4(), g_mvpMatrix = new Matrix4();

function draw(gl, n, viewProjMatrix, u_MvpMatrix, u_NormalMatrix) {
  // Clear color and depth buffer
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Draw a base
  var baseHeight = 1.0;	//Set the height of the layers
  var baseWidth = 20.0;	//Set the width and depth of the layers
  
  g_modelMatrix.setTranslate(0.0, -3.0, 0.0);	//Set the default translation of the base
  g_modelMatrix.translate(x_translate, y_translate, z_translate);
  g_modelMatrix.rotate(z_baseAngle, 0.0, 0.0, 1.0);	//Rotate the base in the z-direction
  g_modelMatrix.rotate(y_baseAngle, 0.0, 1.0, 0.0);	//Rotate the base in the y-direction
  g_modelMatrix.rotate(x_baseAngle, 1.0, 0.0, 0.0);	//Rotate the base in the x-direction
  g_modelMatrix.scale(x_scale, y_scale, z_scale);	//Scale the model using each scaling variable
  g_modelMatrix.shear(x_shearAngle, y_shearAngle, z_shearAngle);	//Shear the model using each shearing variable
  g_modelMatrix.reflect(x_reflect, y_reflect, z_reflect);	//Reflect the model
  drawBox(gl, n, baseWidth, baseHeight, baseWidth, viewProjMatrix, u_MvpMatrix, u_NormalMatrix);	//Draw the base
	
	//Draw all of the layers using the base as a guide
	var layerNum=1;	//Do not change this variable, keeps track of which layer the loop is drawing
	while(baseWidth-2*layerNum > 0){ // Keep drawing layers until it reaches the top
		g_modelMatrix.translate(0.0, baseHeight, 0.0);	//Translate each layer upwards
		g_modelMatrix.rotate(y_spinAngle, 0.0, 1.0, 0.0);	//This is only for the spinning layers, applied to each layer separately
		drawBox(gl, n, baseWidth-2*layerNum, baseHeight, baseWidth-2*layerNum, viewProjMatrix, u_MvpMatrix, u_NormalMatrix);	//Draw the layer
		layerNum++;
	}
}

var g_matrixStack = []; // Array for storing a matrix
function pushMatrix(m) { // Store the specified matrix to the array
  var m2 = new Matrix4(m);
  g_matrixStack.push(m2);
}

function popMatrix() { // Retrieve the matrix from the array
  return g_matrixStack.pop();
}



var g_normalMatrix = new Matrix4();  // Coordinate transformation matrix for normals

// Draw rectangular solid
function drawBox(gl, n, width, height, depth, viewProjMatrix, u_MvpMatrix, u_NormalMatrix) {
  pushMatrix(g_modelMatrix);   // Save the model matrix
    // Scale a cube and draw
    g_modelMatrix.scale(width, height, depth);
    // Calculate the model view project matrix and pass it to u_MvpMatrix
    g_mvpMatrix.set(viewProjMatrix);
    g_mvpMatrix.multiply(g_modelMatrix);
    gl.uniformMatrix4fv(u_MvpMatrix, false, g_mvpMatrix.elements);
    // Calculate the normal transformation matrix and pass it to u_NormalMatrix
    g_normalMatrix.setInverseOf(g_modelMatrix);
    g_normalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_normalMatrix.elements);
    // Draw
    gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_BYTE, 0);
  g_modelMatrix = popMatrix();   // Retrieve the model matrix
}
