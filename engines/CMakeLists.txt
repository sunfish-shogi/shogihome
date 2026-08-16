cmake_minimum_required(VERSION 3.20)
project(shogihome_engines CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_library(shogi_core STATIC
  core/position.cpp
  core/usi.cpp
  core/zobrist.cpp
)
target_include_directories(shogi_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# エンジンごとにライブラリと実行形式を定義する。
# 新しいエンジンを追加する場合は engines/<name>/ を作り、同じ形で登録する。
add_library(basic_engine STATIC
  basic/pst.cpp
  basic/evaluate.cpp
  basic/search.cpp
  basic/tt.cpp
  basic/engine.cpp
)
target_link_libraries(basic_engine PUBLIC shogi_core)
target_include_directories(basic_engine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/basic)

add_executable(basic basic/main.cpp)
target_link_libraries(basic PRIVATE basic_engine)

if(EMSCRIPTEN)
  # postMessage / addMessageListener などのインターフェースを Module に生やす JavaScript。
  set(SHIM_JS ${CMAKE_CURRENT_SOURCE_DIR}/core/shim.js)
  set_target_properties(basic PROPERTIES SUFFIX ".js" LINK_DEPENDS ${SHIM_JS})
  target_link_options(basic PRIVATE
    "-O2"
    "--no-entry"
    "--pre-js" "${SHIM_JS}"
    "-sMODULARIZE=1"
    "-sEXPORT_ES6=1"
    "-sEXPORT_NAME=createBasicEngine"
    "-sENVIRONMENT=worker,node"
    "-sALLOW_MEMORY_GROWTH=1"
    # 既定の 64KB では探索の再帰でスタックが不足する。
    "-sSTACK_SIZE=1048576"
    "-sINVOKE_RUN=0"
    "-sEXPORTED_FUNCTIONS=_usi_command,_usi_poll,_malloc,_free"
    "-sEXPORTED_RUNTIME_METHODS=ccall,cwrap"
    # SharedArrayBuffer を必要としない単一スレッド構成にする。
    # GitHub Pages では COOP/COEP ヘッダを設定できないため。
    "-sUSE_PTHREADS=0"
  )
else()
  find_package(Threads REQUIRED)
  target_link_libraries(basic PRIVATE Threads::Threads)

  enable_testing()
  add_executable(basic_test tests/basic_test.cpp)
  target_link_libraries(basic_test PRIVATE basic_engine)
  add_test(NAME basic_test COMMAND basic_test)
endif()
