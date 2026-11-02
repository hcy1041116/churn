import os
import sys

# 讓測試 import 得到專案根目錄的模組，並在根目錄下讀模型檔
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)
