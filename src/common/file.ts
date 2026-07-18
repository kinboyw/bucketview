export function getFileExtenstion(filepath: string = ""): string | undefined {
  // Remove query string, then strip URL fragment only if # is not at position 0
  // (a filename like #README.md should keep the # as part of the name)
  const noQuery = filepath.split("?")[0];
  const hashIndex = noQuery.indexOf('#');
  const noFragment = hashIndex > 0 ? noQuery.substring(0, hashIndex) : noQuery;
  return noFragment.split('.').pop();
}

export function getFileType(ext: string = ""): string {
  const videos = ".wmv|.rm|.mov|.mpeg|.mp4|.3gp|.flv|.avi|.rmvb|.ts|.asf|.mpg|.webm|.mkv|.wm|.asx|.ram|.mpe|.vob|.dat|.m4v|.f4v|.mxf|.qt".split("|")
  const audios = ".mp3|.ogg|.flac|.m4a|.wav|.wma|.aac|.amr".split("|")
  const images = ".jpg|.jpeg|.png|.bmp|.gif|.tif|.webp|.svg|.ico|.heic|.tiff|.avif".split("|")
  const texts = ".m3u8|.mpd|.txt|.java|.js|.ts|.jsx|.tsx|.php|.go|.ruby|.py|.cpp|.c|.h|.hpp|.rust|.rs|.css|.sass|.scss|.json|.md|.vue|.html|.less|.cs|.vb|.jsp|.rss|.sql|.xml|.env|.csv|.htm|.xhtml|.sh|.zsh|.bash|.swift|.ini|.yaml|.yml|.toml|.conf|.log|.properties|.bat|.ps1|.dockerfile|.makefile|.cmake|.kotlin|.kt|.dart|.lua|.r|.scala|.gradle|.toml|.cfg|.reg|.vbs|.psm1|.psd1"
  const models = ".fbx|.gltf|.glb|.obj|.ply|.stl|.dae"
  const offices = ".docx|.doc|.xlsx|.xls|.pptx|.ppt|.csv"
  if (videos.indexOf("." + ext) != -1) {
    return "video"
  }
  if (audios.indexOf("." + ext) != -1) {
    return "audio"
  }
  if (images.indexOf("." + ext) != -1) {
    return "image"
  }
  if (ext == 'pdf') {
    return "pdf"
  }
  if (models.indexOf("." + ext) != -1) {
    return "model"
  }
  if (offices.indexOf("." + ext) != -1) {
    return "office"
  }
  if (texts.indexOf("." + ext) != -1) {
    return "text"
  }
  return ""
}
