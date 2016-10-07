define(['../actions', '../../util/ajax',
    '../element/actions-impl',
    '../selection/actions-impl'
], function(actions, ajax, elementActions, selectionActions) {
    actions.protectFromMain();

    const api = {
        get: ({productId, invalidate, change}) => (dispatch, getState) => {
            var items = getState().product.items;
            var product = _.findWhere(items, { id: productId })
            var request;

            if (invalidate || !product || !product.extendedData) {
                request = ajax('GET', '/product', {
                    productId,
                    includeExtended: true,
                    params: {
                        includeVertices: true,
                        includeEdges: true
                    }
                })
            }

            if (request) {
                request.then(function(product) {
                        dispatch(api.update(product))

                        const { vertices, edges } = JSON.parse(product.extendedData)
                        const vertexIds = _.pluck(vertices, 'id');
                        const edgeIds = _.pluck(edges, 'id');
                        dispatch(elementActions.get({ vertexIds, edgeIds }));
                    })
            }
        },

        previewChanged: (productId, md5) => ({
            type: 'PRODUCT_PREVIEW_UPDATE',
            payload: { productId, md5 }
        }),

        changedOnServer: (productId, change) => (dispatch, getState) => {
            // TODO: Should check current workspace
            // not current ? just mark it invalid
            // is current  ? is it selected ? get : load list
            dispatch(api.get({ productId, invalidate: true }));
        },

        update: (product) => ({
            type: 'PRODUCT_UPDATE',
            payload: {
                product
            }
        }),

        updatePreview: ({ productId, dataUrl }) => (dispatch, getState) => {
            ajax('POST', '/product', { productId, preview: dataUrl })
        },

        updatePositions: ({ productId, updateVertices }) => (dispatch, getState) => {
            var params = { updateVertices };
            if (!_.isEmpty(updateVertices)) {
                return ajax('POST', '/product', { productId, params })
            }
        },

        updateViewport: ({ productId, pan, zoom }) => ({
            type: 'PRODUCT_UPDATE_VIEWPORT',
            payload: { productId, pan, zoom }
        }),

        dropElements: ({ productId, elements, position }) => (dispatch, getState) => {
            const { vertexIds, edgeIds } = elements;
            var edges = (edgeIds && edgeIds.length) ? (
                ajax('POST', '/edge/multiple', { edgeIds })
                    .then(function({ edges }) {
                        return _.flatten(edges.map(e => [e.inVertexId, e.outVertexId]));
                    })
                ) : Promise.resolve([]);

            edges.then(function(edgeVertexIds) {
                const combined = _.uniq(edgeVertexIds.concat(vertexIds));
                const xInc = 175;
                const yInc = 75;
                const maxX = Math.round(Math.sqrt(combined.length)) * xInc;

                var currentPosition;
                const nextPosition = () => {
                    if (currentPosition) {
                        currentPosition.x += xInc;
                        if ((currentPosition.x - position.x) > maxX) {
                            currentPosition.x = position.x;
                            currentPosition.y += yInc;
                        }
                    } else {
                        currentPosition = {...position} || { x: 0, y: 0 };
                    }
                    return {...currentPosition}
                };

                dispatch(api.updatePositions({
                    productId,
                    updateVertices: _.object(combined.map(id => [id, nextPosition()]))
                }))
            })
        },

        removeElements: ({ productId, elements }) => (dispatch, getState) => {
            var params = { removeVertices: elements },
                state = getState(),
                product = _.findWhere(state.product.items, { id: productId }),
                workspace = state.workspace.byId[state.workspace.currentId],
                { kind } = product;

            // TODO: combine with updatePositions
            if (workspace.editable && !_.isEmpty(params.removeVertices)) {
                ajax('POST', '/product', { productId, kind, params })
                    .then(function() {
                        dispatch(selectionActions.clear())
                    })
            }
        },

        list: () => (dispatch, getState) => {
            dispatch({type: 'PRODUCT_LIST', payload: { loading: true }})
            ajax('GET', '/product/all').then(({types, products}) => {
                dispatch({type: 'PRODUCT_UPDATE_TYPES', payload: { types }})
                dispatch({type: 'PRODUCT_LIST', payload: { loading: false, items: products }})
            })
        },

        create: ({title, kind}) => {
            return ajax('POST', '/product', { title, kind })
                .then(product => api.update(product))
        },

        delete: ({ productId }) => {
            return ajax('DELETE', '/product', { productId })
                .then(() => ({ type: 'PRODUCT_REMOVE', payload: { productId } }))
        },

        remove: (productId) => {
            return { type: 'PRODUCT_REMOVE', payload: { productId }}
        },

        select: (payload) => ({
            type: 'PRODUCT_SELECT',
            payload
        })

    }

    return api;
})
