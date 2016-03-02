var json2csv = require('./node_modules/json2csv');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var dir = process.argv[2];
if(dir == null) {
  dir = "../from_tablets";
}
var output_path = process.argv[3];
if (output_path == null){
  output_path = "../match_data.csv";
}
var backup_dir = path.resolve(path.dirname(output_path),"backup");

// See if backup_dir exists, if it doesn't, create it
try {
  fs.accessSync(backup_dir,fs.R_OK);
} catch (e) {
   fs.mkdirSync(backup_dir);    
}

//Add timestamp to backup_path
var d = new Date();
var backup_path = path.resolve(backup_dir,path.basename(output_path).replace(/\.csv/,""));
var d_str = d.toISOString().replace(/\-/g,"_").replace("T","-").replace(/\.\d+Z/,"").replace(/\:/g,"_");
backup_path += "-" + d_str + ".csv";

//Get all the files from dir recursively
var files = _getFiles(dir);

//Iterate over all files in the directory
var match_data = [];
for (var i=0; i<files.length; ++i) {
  var file_path = files[i];
      
  // If the file looks like a JSON file (i.e. ends in .json)
  if (file_path.match("\.json$")) { 
    // Read the file contents
    var file_contents = fs.readFileSync(file_path,"utf8");
    try {
      // Add the file contents to our contents array
      match_data.push(JSON.parse(file_contents));
    } catch(e) {
      console.log("File " + file_path + " is corrupt, skipping...");  
    } 
  }
}

// Generate row names and array-ify the JSON data
var expanded_data = _expandData(match_data);

// Get all the headers and their data types from the data array
var headers = _extractHeaders(expanded_data);
var header_names = [];
for(var k in headers) header_names.push(k);

// Convert the JSON to CSV and output the file
json2csv({ data: expanded_data, fields: header_names }, function(err, csv) {
  if (err) console.log(err);
   console.log("Writing CSV to " + output_path)
   
   fs.writeFile(output_path, csv, function(err) {
    if (err) throw err;
    console.log('Done writing CSV');
   });
   fs.writeFile(backup_path,csv);  
});

function _getFiles(dir) {
  var dir_files = fs.readdirSync(dir);
  var files = [];
  for (var i=0; i<dir_files.length; ++i) {
    var file_path = path.resolve(dir,dir_files[i]);
    if (fs.statSync(file_path).isDirectory()) {
      files.push.apply(files,_getFiles(file_path));
    } else {
      files.push(file_path);
    }
  }
  return files;
}

function _extractHeaders(rowData) {
  var toRet = {};
  for (var row = 0; row < rowData.length; ++row) {
    var rowLine = rowData[row];
    for (var key in rowLine) {
      if (rowLine.hasOwnProperty(key)) {
        if (!(key in toRet)) {
          toRet[key] = _determineType(rowLine[key]);
        }
      }
    }
  }
  return toRet;
}

function _determineType(primitive) {
  // possible types: 'float', 'date', 'datetime', 'bool', 'string', 'int'
  if (parseInt(primitive) == primitive) return 'int';
  if (parseFloat(primitive) == primitive) return 'float';
  if (isFinite(new Date(primitive).getTime())) return 'datetime';
  return 'string';
}

function _expandData(inputBlob) {
  var retArray = [];
  var objectArray;
  if (inputBlob instanceof Array) {
    objectArray = inputBlob;
  } else {
    objectArray = [ inputBlob ];
  }
  for (var j = 0; j < objectArray.length; ++j) {
    var objectBlob = objectArray[j];
    for (var key in objectBlob) {
      if (typeof objectBlob[key] == 'object') {
        var tempArray = _expandObject(objectBlob[key]);
        for (var i = 0; i < tempArray.length; ++i) {
          var tempObj = tempArray[i];
        
          for (var scalarKey in objectBlob) {
            if (typeof objectBlob[scalarKey] != 'object') {     
              tempObj[scalarKey] = objectBlob[scalarKey];
            }
          }
          retArray.push(tempObj);
        }
      }
    }
  }
  return retArray;
}

function _expandObject(obj) {
  var isArray = 0;
  var retObj;
  
  if (obj instanceof Array) {
    isArray = 1;
    retObj = [];
  } else {
    retObj = {};
  }
  
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && typeof obj[key] == 'object') {
      var subObj = obj[key];
      var expandedSubObj = _expandObject(subObj);
      var tempObj = {};
      for (var subKey in expandedSubObj) {
          var newKey = subKey;
          if (isArray) {
            tempObj[newKey] = expandedSubObj[subKey];
          } else {
            newKey = key + "_" + newKey;
            retObj[newKey] = expandedSubObj[subKey];
          }
      }
      // If the parent is an array, make sure to keep the result an array
      if (isArray) {
        retObj.push(tempObj);
      } 
    } else {
      retObj[key] = obj[key];
    }
  }
  return retObj;
}
