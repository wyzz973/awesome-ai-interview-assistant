#!/bin/bash
# setup-audio.sh
# 检测 BlackHole 虚拟音频设备并创建多输出设备 (macOS)
# 用于捕获系统音频 + 麦克风双通道

set -e

echo "=== AI 面试助手 - 音频环境配置 ==="

# 检测操作系统
if [[ "$(uname)" != "Darwin" ]]; then
  echo "错误: 此脚本仅支持 macOS"
  exit 1
fi

# 检测 BlackHole 是否已安装
echo ""
echo "检测 BlackHole 虚拟音频设备..."
if system_profiler SPAudioDataType 2>/dev/null | grep -qi "blackhole"; then
  echo "✓ BlackHole 已安装"
else
  echo "✗ BlackHole 未安装"
  echo ""
  echo "请安装 BlackHole 2ch:"
  echo "  brew install blackhole-2ch"
  echo ""
  echo "或从官网下载: https://existential.audio/blackhole/"
  exit 1
fi

# 检测是否已有多输出设备
echo ""
echo "检测多输出设备..."

MULTI_OUTPUT_EXISTS=$(system_profiler SPAudioDataType 2>/dev/null | grep -c "Multi-Output Device" || true)

if [ "$MULTI_OUTPUT_EXISTS" -gt 0 ]; then
  echo "✓ 多输出设备已存在"
  echo ""
  echo "请在「系统设置 → 声音 → 输出」中确认已选择多输出设备"
else
  echo "✗ 多输出设备不存在，正在创建..."
  echo ""
  echo "请手动创建多输出设备："
  echo "  1. 打开「音频 MIDI 设置」(在 /Applications/Utilities/ 下)"
  echo "  2. 点击左下角「+」→「创建多输出设备」"
  echo "  3. 勾选「BlackHole 2ch」和你的扬声器/耳机"
  echo "  4. 在「系统设置 → 声音 → 输出」中选择该多输出设备"
  echo ""
  echo "提示: 也可以用命令行打开:"
  echo "  open /System/Applications/Utilities/Audio\ MIDI\ Setup.app"
  open /System/Applications/Utilities/Audio\ MIDI\ Setup.app 2>/dev/null || true
fi

echo ""
echo "=== 配置完成 ==="
echo ""
echo "配置说明:"
echo "  - 系统音频通过 BlackHole 2ch 虚拟设备捕获"
echo "  - 麦克风通过默认输入设备捕获"
echo "  - 多输出设备确保系统音频同时输出到扬声器和 BlackHole"
