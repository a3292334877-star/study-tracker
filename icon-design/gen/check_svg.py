import xml.etree.ElementTree as ET
p=r"D:/DeepseekH/project/study-tracker/icon.svg"
try:
    ET.parse(p); print("xml ok")
except Exception as e: print("xml error",e)
print(open(p,encoding="utf-8").read())
