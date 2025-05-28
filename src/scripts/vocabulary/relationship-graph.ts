import { Word, WordDetails } from './types.js';
import { wordAnalysisCache, accumulatedVocabulary } from './storage.js';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

// 創建專業級關聯圖（使用 Vis.js）
export function createRelationshipGraph(container: HTMLElement, word: Word, details: WordDetails): Network {
    // 清除現有內容
    container.innerHTML = '';

    // 準備節點和邊的數據
    const nodes = new DataSet<any>([]);
    const edges = new DataSet<any>([]);

    const processedWords = new Set<string>();

    // 定義顏色主題
    const colors = {
        center: {
            background: '#1a73e8',
            border: '#0d47a1',
            highlight: { background: '#2196f3', border: '#1565c0' }
        },
        synonym: {
            background: '#4caf50',
            border: '#2e7d32',
            highlight: { background: '#66bb6a', border: '#388e3c' }
        },
        antonym: {
            background: '#f44336',
            border: '#c62828',
            highlight: { background: '#ef5350', border: '#d32f2f' }
        },
        synonymSecond: {
            background: '#81c784',
            border: '#4caf50',
            highlight: { background: '#a5d6a7', border: '#66bb6a' }
        },
        antonymSecond: {
            background: '#ff8a80',
            border: '#f44336',
            highlight: { background: '#ffab91', border: '#ff5722' }
        }
    };

    // 添加中心節點
    nodes.add({
        id: word.text,
        label: `${word.text}\n${word.translation || ''}`,
        group: 'center',
        level: 0,
        physics: false,
        fixed: { x: true, y: true },
        x: 0,
        y: 0,
        size: 40,
        font: {
            size: 16,
            color: '#ffffff',
            face: 'Microsoft JhengHei, Arial',
            bold: true
        },
        color: colors.center,
        borderWidth: 3,
        shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', size: 10 }
    });
    processedWords.add(word.text.toLowerCase());

    // 添加關聯詞的通用函數
    const addRelatedWords = (
        sourceWord: string,
        relatedWords: any[],
        type: 'synonym' | 'antonym',
        level: number
    ) => {
        if (!relatedWords || relatedWords.length === 0) return;

        relatedWords.forEach((related, index) => {
            if (!related || !related.text || typeof related.text !== 'string') return;

            const wordText = related.text.toLowerCase();
            if (!processedWords.has(wordText)) {
                const isAnalyzed = wordAnalysisCache[related.text] !== undefined;
                const isInList = accumulatedVocabulary.some(w =>
                    w && w.text && typeof w.text === 'string' &&
                    w.text.toLowerCase() === related.text.toLowerCase()
                );

                // 選擇顏色
                let nodeColor;
                let nodeSize = 25;
                if (level === 1) {
                    nodeColor = type === 'synonym' ? colors.synonym : colors.antonym;
                    nodeSize = 30;
                } else {
                    nodeColor = type === 'synonym' ? colors.synonymSecond : colors.antonymSecond;
                    nodeSize = 20;
                }

                // 如果已分析，增加光暈效果
                if (isAnalyzed) {
                    nodeColor.highlight.background = nodeColor.background;
                    nodeColor.highlight.border = '#ffd700';
                }

                // 添加節點
                nodes.add({
                    id: related.text,
                    label: `${related.text}\n${related.translation || ''}`,
                    group: type,
                    level: level,
                    size: nodeSize,
                    font: {
                        size: level === 1 ? 14 : 12,
                        color: '#ffffff',
                        face: 'Microsoft JhengHei, Arial',
                        bold: level === 1
                    },
                    color: nodeColor,
                    borderWidth: level === 1 ? 2 : 1,
                    shadow: { enabled: true, color: 'rgba(0,0,0,0.2)', size: 5 },
                    // 標記特殊狀態
                    analyzed: isAnalyzed,
                    inList: isInList
                });

                // 添加邊
                const edgeColor = type === 'synonym' ? '#4caf50' : '#f44336';
                edges.add({
                    from: sourceWord,
                    to: related.text,
                    color: {
                        color: edgeColor,
                        highlight: edgeColor,
                        opacity: level === 1 ? 0.8 : 0.5
                    },
                    width: level === 1 ? 3 : 2,
                    smooth: {
                        enabled: true,
                        type: 'continuous',
                        roundness: 0.2
                    },
                    shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 3 },
                    physics: true
                });

                processedWords.add(wordText);
            }
        });
    };

    // 第一層：添加中心詞的相似詞和反義詞
    addRelatedWords(word.text, details.synonyms, 'synonym', 1);
    addRelatedWords(word.text, details.antonyms, 'antonym', 1);

    // 第二層：添加第一層詞彙的關聯詞
    const firstLevelWords = [...details.synonyms, ...details.antonyms];
    firstLevelWords.forEach((firstLevelWord) => {
        const firstLevelDetails = wordAnalysisCache[firstLevelWord.text];
        if (firstLevelDetails) {
            addRelatedWords(firstLevelWord.text, firstLevelDetails.synonyms, 'synonym', 2);
            addRelatedWords(firstLevelWord.text, firstLevelDetails.antonyms, 'antonym', 2);
        }
    });

    // 創建數據對象
    const data = { nodes, edges };

    // 配置選項
    const options = {
        physics: {
            enabled: true,
            solver: 'forceAtlas2Based' as const,
            forceAtlas2Based: {
                gravitationalConstant: -50,
                centralGravity: 0.01,
                springLength: 100,
                springConstant: 0.08,
                damping: 0.4,
                avoidOverlap: 1
            },
            maxVelocity: 50,
            minVelocity: 0.1,
            stabilization: {
                enabled: true,
                iterations: 1000,
                updateInterval: 100,
                onlyDynamicEdges: false,
                fit: true
            }
        },
        layout: {
            improvedLayout: true,
            hierarchical: false
        },
        nodes: {
            shape: 'circle' as const,
            size: 30,
            scaling: {
                min: 20,
                max: 40,
                label: {
                    enabled: true,
                    min: 10,
                    max: 16,
                    maxVisible: 30,
                    drawThreshold: 1
                }
            },
            font: {
                size: 12,
                face: 'Microsoft JhengHei, Arial, sans-serif',
                color: '#ffffff',
                strokeWidth: 0,
                align: 'center' as const,
                vadjust: 0,
                multi: false
            },
            borderWidth: 3,
            borderWidthSelected: 4,
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.3)',
                size: 8,
                x: 2,
                y: 2
            }
        },
        edges: {
            width: 2,
            color: { inherit: 'from' as const },
            smooth: {
                enabled: true,
                type: 'continuous' as const,
                roundness: 0.2
            },
            arrows: {
                to: { enabled: false },
                from: { enabled: false }
            },
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.1)',
                size: 5,
                x: 2,
                y: 2
            }
        },
        interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true,
            selectConnectedEdges: true,
            hover: true,
            hoverConnectedEdges: true,
            tooltipDelay: 300,
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false
        },
        configure: {
            enabled: false
        }
    };

    // 創建網絡
    const network = new Network(container, data, options);

    // 添加事件監聽器
    network.on('click', async function (params: any) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];

            // 如果點擊的不是中心節點
            if (nodeId !== word.text) {
                const nodeData = nodes.get(nodeId) as any;

                // 檢查是否已在列表中
                const isInList = accumulatedVocabulary.some(w =>
                    w && w.text && typeof w.text === 'string' &&
                    nodeId && typeof nodeId === 'string' &&
                    w.text.toLowerCase() === nodeId.toLowerCase()
                );

                if (!isInList) {
                    try {
                        // 動態導入 handleWordChipClick 函數
                        const { handleWordChipClick } = await import('./word-interactions.js');

                        // 創建一個臨時的 chip 元素
                        const tempChip = document.createElement('div');
                        tempChip.dataset.word = nodeId as string;
                        tempChip.dataset.type = nodeData?.group || 'synonym';

                        await handleWordChipClick(tempChip, word);

                        // 關閉關聯圖
                        const graphContainer = container.closest('.relationship-graph-container') as HTMLElement;
                        if (graphContainer) {
                            graphContainer.classList.remove('active');
                            setTimeout(() => {
                                graphContainer.style.display = 'none';
                            }, 300);
                        }
                    } catch (error) {
                        console.error('點擊節點失敗:', error);
                    }
                }
            }
        }
    });

    // 懸停提示
    network.on('hoverNode', function (params: any) {
        const nodeId = params.node;
        const nodeData = nodes.get(nodeId) as any;

        if (nodeData) {
            const tooltip = `
                <div style="padding: 8px; background: rgba(0,0,0,0.8); color: white; border-radius: 4px; font-size: 12px;">
                    <strong>${nodeData.id}</strong><br>
                    ${nodeData.analyzed ? '✅ 已分析' : '⏳ 未分析'}<br>
                    ${nodeData.inList ? '📋 已在列表中' : '➕ 點擊添加'}
                </div>
            `;
            // 注意：vis-network 沒有內建 tooltip，可以考慮添加自定義實現
        }
    });

    // 穩定化完成後調整視圖
    network.once('stabilizationIterationsDone', function () {
        network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuart'
            }
        } as any);
    });

    // 簡化的使用說明
    const instructions = document.createElement('div');
    instructions.className = 'vis-instructions';
    instructions.innerHTML = `
        <div class="vis-instruction-item">
            <span class="instruction-icon">🖱️</span>
            <span>拖拽節點或視圖</span>
        </div>
        <div class="vis-instruction-item">
            <span class="instruction-icon">🔍</span>
            <span>滾輪縮放</span>
        </div>
        <div class="vis-instruction-item">
            <span class="instruction-icon">➕</span>
            <span>點擊節點添加單字</span>
        </div>
        <div class="vis-instruction-item">
            <span class="instruction-icon">✨</span>
            <span>智能物理佈局</span>
        </div>
    `;
    container.appendChild(instructions);

    return network;
} 