"""Bake the painted side and end panels onto a rotating van. Requires Pillow, NumPy and OpenCV."""
from pathlib import Path
import math
import cv2
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2]
sheet=Image.open(root/'assets/rescueVan.webp').convert('RGBA')
side,front,rear=[np.asarray(sheet.crop((x,y,x+288,y+288))) for x,y in [(0,0),(0,288),(288,288)]]
# Longitudinal body profile, from rear sill over roof, windscreen and bonnet to front sill.
profile=[(-14,1.3),(-14,5.3),(-13.6,10.2),(-12.4,11.6),(6.9,11.6),(8,10.7),(10.5,6.2),(13.5,5.4),(14.4,4.3),(14.4,1.3)]
side_uv=[(22,168),(21,129),(29,78),(37,59),(201,59),(210,76),(229,112),(256,122),(265,135),(264,168)]
widths=[5.5,5.5,5.0,4.6,4.6,4.9,5.2,5.3,5.4,5.5]
cv2.setNumThreads(1)
roof=side.copy()
# The roof's blue glass belongs to the separate raised beacons.
for x in [67,185]:roof[30:46,x-15:x+15]=roof[30:46,105:135]
S=192
def render(angle,damage):
 c,s=math.cos(angle),math.sin(angle); dest=np.zeros((S,S,4),np.uint8)
 def proj(u,v,z):
  if damage:
   nose=max(0,u-6);u-=damage*nose*.48;v+=damage*nose*.29
   z-=damage*(max(0,z-4)*.55+max(0,v)*.08)
  return [96+5.65*(u*c-v*s),122+5.65*((u*s+v*c)*.78-z)]
 def tri(tex,uv,xyz):
  uv=np.float32(uv);points=np.float32([proj(*p) for p in xyz])
  if abs(cv2.contourArea(points))<.04:return
  x,y,w,h=cv2.boundingRect(points); x0=max(x,0);y0=max(y,0);x1=min(x+w,S);y1=min(y+h,S)
  if x0>=x1 or y0>=y1:return
  pts=points-[x0,y0];m=cv2.getAffineTransform(uv,pts.astype('float32'))
  patch=cv2.warpAffine(tex,m,(x1-x0,y1-y0),flags=cv2.INTER_LINEAR)
  mask=np.zeros((y1-y0,x1-x0),np.uint8);cv2.fillConvexPoly(mask,np.int32(np.round(pts*16)),255,shift=4)
  target=dest[y0:y1,x0:x1];use=(mask>0)&(patch[:,:,3]>40);target[use]=patch[use]
 def quad(tex,uv,pts):
  for ii in [(0,1,2),(0,2,3)]:tri(tex,[uv[i] for i in ii],[pts[i] for i in ii])
 def strip(i,j,tex,uv):
  u,z=profile[i];q,h=profile[j]
  quad(tex,uv,[(u,-widths[i],z),(u,widths[i],z),(q,widths[j],h),(q,-widths[j],h)])
 flank=1 if c>=0 else -1
 # Cutout side contains distinct door outlines, star, stripe and wheel arches.
 # Fan around an interior anchor to preserve the silhouette of the sloping bonnet.
 for i in range(len(profile)):
  j=(i+1)%len(profile);u,z=profile[i];q,h=profile[j]
  tri(side,[(136,117),side_uv[i],side_uv[j]],[(0,5.4*flank,6),(u,widths[i]*flank,z),(q,widths[j]*flank,h)])
 if s>=0:
  # Front bumper, grille, enamel bonnet and windscreen, from low to high.
  for i,j,t,b in [(9,8,245,218),(8,7,218,209),(7,6,209,188),(6,5,188,134),(5,4,134,127)]:
   strip(i,j,front,[(191,t),(96,t),(96,b),(191,b)])
 else:
  for i,j,b,t in [(0,1,246,210),(1,2,210,140),(2,3,140,125)]:
   strip(i,j,rear,[(90,b),(198,b),(198,t),(90,t)])
 strip(3,4,roof,[(39,33),(37,60),(201,60),(194,33)])
 for axle in [-8.6,9.6]:
  face=5.6*flank;centre=68 if axle<0 else 226
  quad(side,[(centre-18,149),(centre+18,149),(centre+18,189),(centre-18,189)],
       [(axle-2.1,face,4.4),(axle+2.1,face,4.4),(axle+2.1,face,-.1),(axle-2.1,face,-.1)])
 # Two blue beacons stand above the roof with the painted specular highlight intact.
 for u in ([-9,5] if damage<1 else [-9]):
  x,y=proj(u,0,12.8);x=int(x)-5;y=int(y)-5
  light=cv2.resize(side[18:44,55:80],(11,12),interpolation=cv2.INTER_AREA)
  mask=np.zeros((12,11),np.uint8);cv2.ellipse(mask,(5,6),(5,6),0,0,360,255,-1)
  patch=dest[y:y+12,x:x+11];use=(light[:,:,3]>64)&(mask>0);patch[use]=light[use]
 if damage:
  def panel(points,color):
   cv2.fillPoly(dest,[np.int32([proj(*pt) for pt in points])],color,lineType=cv2.LINE_AA)
  if s>0:
   points=[(8,-4,10.4),(8.9,-1.7,8.5),(8.2,-.5,10.2),(9.6,1.2,7),(8.7,3,9),(10.5,4,6.5),(10.5,-4,6.5)]
   panel(points,(44,39,54,255))
  if damage==1:
   panel([(10.6,-4,6.5),(14,-4,4.8),(14,4,4.8),(10.6,4,6.5)],(47,42,45,255))
   panel([(10.6,-4,6.6),(11,-3.6,11),(12.8,.4,8.5),(12,2,9.4),(10.6,3,6.6)],(166,139,113,255))
   panel([(13.8,-5,2),(16,-3,.3),(15.5,4,.2),(15,3.8,.9),(15.2,-2.6,1.1)],(128,118,119,255))
  mask=dest[:,:,3]>0;dest[:,:,:3][mask]=(dest[:,:,:3][mask]*(1-damage*.17)).astype('uint8')
 return Image.fromarray(dest)
for filename,damage in [('ambulanceTurns',0),('ambulanceDented',.5),('ambulanceWreck',1)]:
 size=192 if damage==0 else 144
 atlas=Image.new('RGBA',(size*8,size*8))
 for frame in range(64):
  pose=render(frame*math.tau/64,damage).resize((size,size),Image.Resampling.LANCZOS)
  atlas.paste(pose,(size*(frame%8),size*(frame//8)))
 atlas.save(root/f'assets/{filename}.webp',quality=90,method=3)
